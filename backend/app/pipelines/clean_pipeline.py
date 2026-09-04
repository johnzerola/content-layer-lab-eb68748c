"""Núcleo do VaiViral Clean Engine (fase local, CPU-first).

Fluxo por vídeo:

    master preservado
        -> proxy leve para análise
        -> caption zone por amostragem
        -> ROI recortada (+ contexto)
        -> máscara por frame (fill + stroke + sombra + glow)
        -> reconstrução temporal (TBE) com pixels reais do próprio vídeo
        -> quality score 0-100
        -> retry com parâmetros diferentes / LaMa na ROI / marcação para GPU
        -> composição de volta no master + áudio original

Nada de blur, tarja, corte ou preenchimento por cor: cada pixel escrito é um
pixel real de outro frame, um patch exemplar da própria cena ou uma
reconstrução do modelo de inpainting.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence

import cv2
import numpy as np

from ..providers.lama_provider import LaMaProvider
from ..providers.sam2_provider import Sam2Provider
from ..video.protect import ProtectMap
from .object_pipeline import ObjectMaskStats, Selection, build_object_masks, stats_to_metrics
from .plate import reconstruct_with_plates
from ..providers.rapidocr_provider import GlyphMaskGenerator, RapidOcrTextDetector
from ..providers.temporal_provider import TemporalProvider
from ..quality.scoring import QualityReport, quality_score
from ..services import mask_modes, tracking
from ..services.scene import detect_scenes
from ..services.watermark import frame_watermark_mask
from ..utils.video import RawWriter, mux_audio, probe, read_chunk, trim_video
from ..video.proxy import build_proxy
from ..video.roi import Roi
from . import caption_zone as zone_svc

Progress = Optional[Callable[[float, str], None]]

_DETECT_WIDTH = 640

QUALITY_PRESETS: Dict[str, dict] = {
    # janela temporal / correção por fluxo / passes de retry / uso de LaMa
    # Medido nos clipes sintéticos: alongar a janela de 16 para 48 amostras mudou
    # o erro em <0,1 dB, e a correção por fluxo custou +50% de tempo sem ganho —
    # em cena estática o fundo simplesmente nunca é exposto, então a janela não
    # tem o que colher. Por isso `flow` fica desligado por padrão (`--flow` liga)
    # e o esforço vai para o preenchimento.
    "fast": {"samples": 24, "flow": False, "key_step": 6, "retries": 0, "lama": False, "chunk": 4.0, "lama_keys": 0},
    "high": {"samples": 32, "flow": False, "key_step": 4, "retries": 1, "lama": True, "chunk": 5.0, "lama_keys": 2},
    "max": {"samples": 48, "flow": False, "key_step": 2, "retries": 2, "lama": True, "chunk": 6.0, "lama_keys": 4},
}



MODES = ("caption", "karaoke", "text", "logo", "object", "auto")


@dataclass
class CleanOptions:
    mode: str = "caption"
    quality: str = "fast"
    preview_seconds: float = 0.0
    cpu_only: bool = True
    gpu: bool = False
    proxy_width: int = 540
    mask_expand_px: int = 4
    mask_feather_px: int = 3
    mask_confidence: float = 0.15
    roi_percent: Optional[dict] = None
    overlap_seconds: float = 0.5
    workdir: Optional[str] = None
    keep_workdir: bool = False
    # AUTO-LaMa: liga o inpainting por modelo mesmo em presets sem LaMa,
    # quando a máscara é pequena (barato) e o TBE não fechou o chunk.
    auto_lama: bool = True
    # Correção residual por fluxo óptico no TBE (opt-in: só compensa quando o
    # fundo tem parallax forte; em cena plana só custa tempo).
    flow_refine: bool = False

    auto_lama_max_mask: float = 0.18  # fração máxima da ROI coberta pela máscara
    auto_lama_min_mask: float = 0.0008
    # Modo objeto: o que o usuário apontou (percentual do frame).
    #   {"boxes": [[x, y, w, h]], "points": [[x, y, 1]]}
    selection: Optional[dict] = None
    object_key_step: int = 8
    # Protect Area: o que o motor não pode tocar.
    protect_regions: List[dict] = field(default_factory=list)
    protect_person: bool = False
    protect_feather_px: int = 9


@dataclass
class CleanResult:
    output: str
    score: float
    route: str
    metrics: Dict[str, float] = field(default_factory=dict)
    telemetry: Dict[str, float] = field(default_factory=dict)
    roi: Optional[dict] = None
    zone: Optional[dict] = None
    engine: str = "tbe"
    chunks: List[dict] = field(default_factory=list)
    gpu_recommended: bool = False

    def as_dict(self) -> dict:
        return {
            "output": self.output,
            "quality_score": round(self.score, 1),
            "route": self.route,
            "engine": self.engine,
            "roi": self.roi,
            "caption_zone": self.zone,
            "metrics": self.metrics,
            "telemetry_ms": self.telemetry,
            "gpu_recommended": self.gpu_recommended,
            "chunks": self.chunks,
        }


class _Timer:
    """Telemetria por estágio: ocr_ms, mask_ms, temporal_ms, inpaint_ms…"""

    def __init__(self) -> None:
        self.totals: Dict[str, float] = {}

    def add(self, stage: str, started: float) -> None:
        self.totals[stage] = self.totals.get(stage, 0.0) + (time.perf_counter() - started) * 1000.0

    def as_dict(self) -> Dict[str, float]:
        return {k: round(v, 1) for k, v in sorted(self.totals.items())}


def _cache_dir(source: str, base: Optional[str]) -> str:
    stat = os.stat(source)
    key = hashlib.sha1(
        f"{os.path.abspath(source)}:{stat.st_size}:{int(stat.st_mtime)}".encode()
    ).hexdigest()[:16]
    root = base or os.path.join(tempfile.gettempdir(), "vaiviral-clean")
    path = os.path.join(root, key)
    os.makedirs(path, exist_ok=True)
    return path


def _cached_json(path: str):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return None
    return None


def _store_json(path: str, payload) -> None:
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
    except OSError:
        pass


def _detect_boxes_scaled(detector, crop: np.ndarray) -> List[tuple]:
    """Detecta no recorte reduzido e devolve caixas na escala do recorte."""
    height, width = crop.shape[:2]
    scale = min(1.0, _DETECT_WIDTH / float(max(1, width)))
    small = crop if scale >= 0.999 else cv2.resize(
        crop, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA
    )
    boxes = detector.detect(small)
    if scale >= 0.999:
        return list(boxes)
    factor = 1.0 / scale
    return [
        (
            int(round(x * factor)),
            int(round(y * factor)),
            int(round(w * factor)),
            int(round(h * factor)),
        )
        for (x, y, w, h) in boxes
    ]


def _chunk_masks(
    crops: List[np.ndarray],
    detector,
    generator: GlyphMaskGenerator,
    mode: str,
    key_step: int,
    timer: _Timer,
    segmenter=None,
    object_hint: Optional[dict] = None,
    object_stats: Optional[ObjectMaskStats] = None,
    expand_px: int = 6,
) -> np.ndarray:
    """Máscara por frame do chunk, detectando só em keyframes."""
    count = len(crops)
    height, width = crops[0].shape[:2]

    if mode == "object":
        # Objeto não passa por OCR: a máscara vem da seleção promptável e é
        # propagada no tempo (SAM2 quando há pesos, GrabCut quando não há).
        started = time.perf_counter()
        if segmenter is None or not object_hint:
            return np.zeros((count, height, width), np.uint8)
        masks = build_object_masks(
            crops, segmenter, object_hint,
            key_step=max(2, key_step), expand_px=expand_px, stats=object_stats,
        )
        timer.add("segment_ms", started)
        return masks

    keys = list(range(0, count, max(1, key_step)))
    if keys[-1] != count - 1:
        keys.append(count - 1)

    key_masks: List[np.ndarray] = []
    previous_probe: Optional[np.ndarray] = None
    previous_mask: Optional[np.ndarray] = None
    for key in keys:
        frame = crops[key]
        signature = cv2.resize(
            cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36), interpolation=cv2.INTER_AREA
        ).astype(np.int16)
        if previous_mask is not None and previous_probe is not None:
            if float(np.mean(np.abs(signature - previous_probe))) < 1.2:
                key_masks.append(previous_mask.copy())
                continue
        started = time.perf_counter()
        if mode == "logo":
            boxes: List[tuple] = []
            detected = frame_watermark_mask(frame)
        else:
            boxes = _detect_boxes_scaled(detector, frame)
            if mode == "karaoke":
                boxes = zone_svc.group_karaoke_lines(boxes)
            detected = None
        timer.add("ocr_ms", started)

        started = time.perf_counter()
        if detected is None:
            detected = generator.build(frame, boxes)
        timer.add("mask_ms", started)

        previous_probe = signature
        previous_mask = detected
        key_masks.append(detected)

    started = time.perf_counter()
    masks = tracking.interpolate_keyframes(crops, keys, key_masks)
    if mode == "karaoke":
        masks = mask_modes.karaoke_union(masks)
    elif mode == "logo":
        locked = mask_modes.vote_locked_mask(masks)
        masks = mask_modes.apply_locked(masks, locked)
    out = np.zeros((count, height, width), np.uint8)
    for i, m in enumerate(masks):
        out[i] = m
    timer.add("mask_ms", started)
    return out


def _scene_of(frame_index: int, scenes: Sequence[tuple]) -> tuple:
    for start, end in scenes:
        if start <= frame_index < end:
            return (start, end)
    return (0, 10 ** 9)


def clean_video(
    source: str,
    output: str,
    options: Optional[CleanOptions] = None,
    on_progress: Progress = None,
) -> CleanResult:
    opts = options or CleanOptions()
    if opts.mode not in MODES:
        raise ValueError(f"modo inválido: {opts.mode}")
    preset = QUALITY_PRESETS.get(opts.quality)
    if preset is None:
        raise ValueError(f"qualidade inválida: {opts.quality}")

    timer = _Timer()
    started_all = time.perf_counter()

    def emit(pct: float, stage: str) -> None:
        if on_progress:
            on_progress(max(0.0, min(100.0, pct)), stage)

    workdir = _cache_dir(source, opts.workdir)
    emit(2, "Preparando vídeo")

    master_path = source
    if opts.preview_seconds > 0:
        master_path = os.path.join(workdir, f"preview_{int(opts.preview_seconds)}s.mp4")
        if not os.path.exists(master_path):
            trim_video(source, master_path, opts.preview_seconds)

    info = probe(master_path)
    started = time.perf_counter()
    proxy = build_proxy(master_path, workdir, opts.proxy_width, master=info)
    timer.add("proxy_ms", started)

    detector = RapidOcrTextDetector()
    generator = GlyphMaskGenerator(opts.mask_expand_px, opts.mask_feather_px)
    selection = Selection.from_dict(opts.selection)
    segmenter = Sam2Provider() if opts.mode == "object" else None
    object_stats = ObjectMaskStats() if opts.mode == "object" else None
    protect = ProtectMap.build(opts.protect_regions, opts.protect_person, opts.protect_feather_px)
    protect_timed = any(r.start > 0 or r.end != float("inf") for r in protect.regions)

    zone_payload: dict = {}
    zone_master = None
    if opts.mode == "object":
        if selection.empty:
            raise ValueError("modo object exige seleção: --box ou --point")
    else:
        emit(8, "Detectando texto")
        started = time.perf_counter()
        zone_cache = os.path.join(workdir, f"zone_{opts.mode}.json")
        cached = _cached_json(zone_cache)
        if cached and cached.get("zone"):
            zone_master = Roi.from_percent(
                cached["zone"]["x"], cached["zone"]["y"], cached["zone"]["w"], cached["zone"]["h"],
                info.width, info.height,
            )
            zone_payload = cached
        else:
            scan = zone_svc.scan_zone(
                proxy.path,
                detector,
                step=max(5, int(round(info.fps / 2))),
                subtitle_only=opts.mode in ("caption", "karaoke"),
            )
            zone_payload = scan.as_dict(proxy.width, proxy.height)
            _store_json(zone_cache, zone_payload)
            zone_master = (
                scan.zone.scaled(1.0 / max(proxy.scale, 1e-6), info.width, info.height)
                if scan.zone
                else None
            )
        timer.add("zone_ms", started)

    if opts.roi_percent:
        roi = Roi.from_percent(
            float(opts.roi_percent.get("x", 0)),
            float(opts.roi_percent.get("y", 0)),
            float(opts.roi_percent.get("w", 1)),
            float(opts.roi_percent.get("h", 1)),
            info.width, info.height,
        )
    elif opts.mode == "object":
        # ROI = envelope da seleção. Objeto pequeno num vídeo 4K não deve
        # custar processamento do frame inteiro.
        emit(8, "Preparando seleção")
        bbox = selection.bbox_percent(margin=0.08) or (0.0, 0.0, 1.0, 1.0)
        roi = Roi.from_percent(bbox[0], bbox[1], bbox[2], bbox[3], info.width, info.height)
    elif zone_master is not None:
        roi = zone_master.expand(int(round(max(info.width, info.height) * 0.035)), info.width, info.height)
    else:
        roi = Roi.full(info.width, info.height)
    roi = roi.even(info.width, info.height)

    object_hint = (
        selection.to_pixels(info.width, info.height, roi.x, roi.y)
        if opts.mode == "object"
        else None
    )

    started = time.perf_counter()
    scenes_cache = os.path.join(workdir, "scenes.json")
    scenes = _cached_json(scenes_cache)
    if scenes is None:
        scenes = [list(s) for s in detect_scenes(proxy.path)]
        _store_json(scenes_cache, scenes)
    scenes = [tuple(s) for s in scenes]
    timer.add("scene_ms", started)

    temporal = TemporalProvider(
        preset["samples"], opts.mask_feather_px,
        bool(preset.get("flow", False)) or bool(opts.flow_refine),
    )

    _lama_state: Dict[str, object] = {
        "provider": LaMaProvider() if preset["lama"] and not opts.gpu else None,
        "tried": bool(preset["lama"]) or bool(opts.gpu),
        "auto_activations": 0,
    }

    def _lama_for(mask_ratio: float) -> Optional[LaMaProvider]:
        """Resolve o provider de inpainting para este chunk.

        Regra do modo AUTO: se o preset não pediu LaMa, ele ainda entra quando
        (a) o TBE não fechou o chunk e (b) a máscara é pequena — pouca área a
        reconstruir significa poucos tiles 512x512, custo previsível em CPU.
        Máscara grande fica com TBE + rota GPU, porque LaMa em CPU sobre faixa
        larga é lento e devolve bloco liso (o borrão que não queremos).
        """
        provider = _lama_state["provider"]
        if provider is not None:
            return provider  # type: ignore[return-value]
        if opts.gpu or not opts.auto_lama or _lama_state["tried"]:
            return None
        if mask_ratio > opts.auto_lama_max_mask or mask_ratio < opts.auto_lama_min_mask:
            return None
        _lama_state["tried"] = True
        candidate = LaMaProvider()
        if not candidate.available():
            return None
        _lama_state["provider"] = candidate
        return candidate


    total_frames = max(1, info.frames)
    chunk_size = max(8, int(round(info.fps * float(preset["chunk"]))))
    overlap = max(2, int(round(info.fps * opts.overlap_seconds)))

    raw_path = os.path.join(workdir, "clean_raw.mp4")
    writer = RawWriter(raw_path, info.width, info.height, info.fps)

    chunk_reports: List[dict] = []
    scores: List[float] = []
    all_metrics: List[Dict[str, float]] = []
    gpu_recommended = False
    plate_totals: Dict[str, int] = {}
    written = 0
    position = 0

    try:
        while position < total_frames:
            scene_start, scene_end = _scene_of(position, scenes)
            # A janela temporal nunca atravessa um corte de cena: pixels de
            # outra cena não são fundo válido para esta.
            lead = min(overlap, max(0, position - scene_start))
            body = min(chunk_size, total_frames - position, max(1, scene_end - position))
            tail = min(overlap, max(0, scene_end - (position + body)))
            read_start = position - lead
            frames = read_chunk(master_path, read_start, lead + body + tail)
            if not frames:
                break
            body = min(body, len(frames) - lead)
            if body <= 0:
                break

            crops = [roi.crop(f) for f in frames]
            masks = _chunk_masks(
                crops, detector, generator, opts.mode, int(preset["key_step"]), timer,
                segmenter=segmenter, object_hint=object_hint, object_stats=object_stats,
                expand_px=opts.mask_expand_px,
            )

            # Protect Area: subtrai da máscara tudo que é intocável, antes de
            # qualquer reconstrução. Assim nenhum motor escreve sobre o rosto.
            if protect.active:
                started = time.perf_counter()
                person = protect.person_mask(crops)
                static_manual = (
                    roi.crop(protect.frame_mask(info.width, info.height, 0.0))
                    if protect.regions and not protect_timed
                    else None
                )
                for i in range(len(masks)):
                    guard = static_manual
                    if protect_timed:
                        seconds = (read_start + i) / max(1.0, info.fps)
                        guard = roi.crop(protect.frame_mask(info.width, info.height, seconds))
                    if person is not None:
                        guard = person if guard is None else np.maximum(guard, person)
                    if guard is not None and guard.max() > 0:
                        masks[i] = protect.subtract(masks[i], guard)
                timer.add("protect_ms", started)

            emit(
                10 + 80 * (position / float(total_frames)),
                "Reconstruindo fundo",
            )
            started = time.perf_counter()
            cleaned = temporal.reconstruct(np.asarray(crops), masks)
            timer.add("temporal_ms", started)

            started = time.perf_counter()
            report = quality_score(list(cleaned), masks)
            timer.add("quality_ms", started)

            attempt = 0
            engine_used = "tbe"
            while report.route != "done" and attempt < int(preset["retries"]):
                attempt += 1
                # Retry com parâmetros diferentes: máscara maior, borda mais
                # suave e janela temporal mais longa.
                wider = GlyphMaskGenerator(
                    opts.mask_expand_px + 3 * attempt,
                    opts.mask_feather_px + 2 * attempt,
                )
                started = time.perf_counter()
                masks = _chunk_masks(crops, detector, wider, opts.mode, max(1, int(preset["key_step"]) // 2), timer)
                timer.add("mask_ms", started)
                started = time.perf_counter()
                cleaned = temporal.with_window(int(preset["samples"] * (1 + attempt))).reconstruct(
                    np.asarray(crops), masks
                )
                timer.add("temporal_ms", started)
                started = time.perf_counter()
                report = quality_score(list(cleaned), masks)
                timer.add("quality_ms", started)
                engine_used = "tbe+retry"

            mask_ratio = float(np.count_nonzero(masks) / max(1, masks.size))
            lama = _lama_for(mask_ratio) if report.route != "done" else None
            # O teto de máscara é regra do gatilho AUTO (custo imprevisível em
            # CPU). Quando o usuário pediu `high`/`max` explicitamente, o LaMa
            # roda mesmo em faixa larga — era isso que fazia o preset alto
            # terminar em TBE puro e nunca acionar o inpainting.
            explicit = bool(preset["lama"])
            small_mask = explicit or mask_ratio <= opts.auto_lama_max_mask
            if report.route != "done" and lama is not None and lama.available() and small_mask:

                emit(10 + 80 * (position / float(total_frames)), "IA avançada")
                started = time.perf_counter()
                # LaMa em poucos keyframes + propagação alinhada: reconstrói
                # estrutura (linhas, bordas) sem pagar uma inferência por frame.
                budget = int(preset.get("lama_keys", 2) or 2)
                before = list(cleaned)
                cleaned, plate_stats = reconstruct_with_plates(
                    crops, list(masks), list(cleaned), lama,
                    budget=budget, feather=max(3, opts.mask_feather_px),
                )
                timer.add("inpaint_ms", started)
                plate_totals["lama_inferences"] = plate_totals.get("lama_inferences", 0) + plate_stats.inferences
                plate_totals["lama_propagated"] = plate_totals.get("lama_propagated", 0) + plate_stats.propagated
                plate_totals["lama_fallbacks"] = plate_totals.get("lama_fallbacks", 0) + plate_stats.fallbacks
                plate_totals["lama_chunks"] = plate_totals.get("lama_chunks", 0) + 1
                started = time.perf_counter()
                lama_report = quality_score(list(cleaned), masks)
                timer.add("quality_ms", started)
                # Só aceita o resultado do modelo se ele melhorou o score.
                if lama_report.score >= report.score:
                    report = lama_report
                    engine_used = "tbe+lama"
                else:
                    cleaned = before
                    plate_totals["lama_rejected"] = plate_totals.get("lama_rejected", 0) + 1



            if report.route == "gpu":
                gpu_recommended = True

            # Guarda de segurança contra borrão: fora da máscara (dilatada e
            # suavizada) o pixel original é restaurado, então nenhum motor pode
            # deixar manchas/blocos em áreas que nunca tiveram texto.
            k = max(3, int(opts.mask_expand_px) * 2 + 5)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
            restored = []
            for i in range(len(cleaned)):
                m = np.asarray(masks[i])
                if m.max() == 0:
                    restored.append(np.asarray(crops[i]))
                    continue
                soft = cv2.GaussianBlur(
                    cv2.dilate(m, kernel).astype(np.float32) / 255.0, (0, 0), max(2.0, k / 4.0)
                )
                soft = np.clip(soft, 0.0, 1.0)[..., None]
                restored.append(
                    (np.asarray(cleaned[i], np.float32) * soft
                     + np.asarray(crops[i], np.float32) * (1.0 - soft)).astype(np.uint8)
                )
            cleaned = restored

            # Pós-passe de harmonização: casa grão, cor e nitidez da área
            # reconstruída com o fundo ao redor. Só entra se não piorar o score.
            if opts.harmonize:
                started = time.perf_counter()
                harmonized, h_stats = harmonize_sequence(
                    cleaned, masks, grain=opts.harmonize_grain
                )
                timer.add("harmonize_ms", started)
                if h_stats.applied:
                    started = time.perf_counter()
                    h_report = quality_score(list(harmonized), masks)
                    timer.add("quality_ms", started)
                    if h_report.score >= report.score - 0.5:
                        cleaned = harmonized
                        report = h_report
                        for key, value in h_stats.as_dict().items():
                            plate_totals[key] = plate_totals.get(key, 0) + value
                    else:
                        plate_totals["harmonize_rejected"] = (
                            plate_totals.get("harmonize_rejected", 0) + 1
                        )

            started = time.perf_counter()
            for i in range(lead, lead + body):
                if written >= total_frames:
                    break
                writer.write(roi.paste(frames[i], cleaned[i], feather=2))
                written += 1
            timer.add("encode_ms", started)

            scores.append(report.score)
            all_metrics.append(report.metrics)
            chunk_reports.append(
                {
                    "start_frame": position,
                    "frames": body,
                    "mask_ratio": round(mask_ratio, 4),
                    "engine": engine_used,
                    "quality_score": round(report.score, 1),
                    **report.metrics,
                }
            )
            position += body
    finally:
        writer.close()

    emit(94, "Exportando")
    started = time.perf_counter()
    os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
    mux_audio(raw_path, master_path, output, info.has_audio)
    timer.add("mux_ms", started)

    score = float(np.mean(scores)) if scores else 100.0
    worst = min(scores) if scores else 100.0
    metrics: Dict[str, float] = {}
    for key in ("residual_text", "ghost_edge", "flicker", "texture_gap"):
        values = [m.get(key, 0.0) for m in all_metrics if key in m]
        if values:
            metrics[key] = round(float(max(values)), 4)
    for key in ("sharpness_ratio", "temporal_consistency"):
        values = [m.get(key, 1.0) for m in all_metrics if key in m]
        if values:
            metrics[key] = round(float(min(values)), 3)
    metrics["worst_chunk_score"] = round(worst, 1)
    for key, value in plate_totals.items():
        metrics[key] = float(value)
    if object_stats is not None:
        metrics.update(stats_to_metrics(object_stats))
    if protect.active:
        metrics["protect_regions"] = float(len(protect.regions))
        metrics["protect_person"] = 1.0 if protect.protect_person else 0.0


    timer.totals["total_ms"] = (time.perf_counter() - started_all) * 1000.0
    emit(100, "Concluído")

    if not opts.keep_workdir and opts.preview_seconds > 0:
        shutil.rmtree(workdir, ignore_errors=True)

    return CleanResult(
        output=output,
        score=score,
        route="done" if score >= 90 and not gpu_recommended else ("gpu" if gpu_recommended else "retry"),
        metrics=metrics,
        telemetry=timer.as_dict(),
        roi=roi.to_percent(info.width, info.height),
        zone=zone_payload.get("zone") if isinstance(zone_payload, dict) else None,
        engine="tbe+lama" if plate_totals.get("lama_inferences") else "tbe",
        chunks=chunk_reports,
        gpu_recommended=gpu_recommended,
    )
