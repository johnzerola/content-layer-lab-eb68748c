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
    # janela temporal / passes de retry / uso de LaMa
    "fast": {"samples": 16, "key_step": 6, "retries": 0, "lama": False, "chunk": 4.0, "lama_keys": 0},
    "high": {"samples": 28, "key_step": 4, "retries": 1, "lama": True, "chunk": 5.0, "lama_keys": 2},
    "max": {"samples": 48, "key_step": 2, "retries": 2, "lama": True, "chunk": 6.0, "lama_keys": 4},
}

MODES = ("caption", "karaoke", "text", "logo", "auto")


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
) -> np.ndarray:
    """Máscara por frame do chunk, detectando só em keyframes."""
    count = len(crops)
    height, width = crops[0].shape[:2]
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
    elif zone_master is not None:
        roi = zone_master.expand(int(round(max(info.width, info.height) * 0.035)), info.width, info.height)
    else:
        roi = Roi.full(info.width, info.height)
    roi = roi.even(info.width, info.height)

    started = time.perf_counter()
    scenes_cache = os.path.join(workdir, "scenes.json")
    scenes = _cached_json(scenes_cache)
    if scenes is None:
        scenes = [list(s) for s in detect_scenes(proxy.path)]
        _store_json(scenes_cache, scenes)
    scenes = [tuple(s) for s in scenes]
    timer.add("scene_ms", started)

    temporal = TemporalProvider(preset["samples"], opts.mask_feather_px)
    lama = LaMaProvider() if preset["lama"] and not opts.gpu else None

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
            masks = _chunk_masks(crops, detector, generator, opts.mode, int(preset["key_step"]), timer)

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

            if report.route != "done" and lama is not None and lama.available():
                emit(10 + 80 * (position / float(total_frames)), "IA avançada")
                started = time.perf_counter()
                # LaMa em poucos keyframes + propagação alinhada: reconstrói
                # estrutura (linhas, bordas) sem pagar uma inferência por frame.
                budget = int(preset.get("lama_keys", 2))
                cleaned, plate_stats = reconstruct_with_plates(
                    crops, list(masks), list(cleaned), lama,
                    budget=budget, feather=max(3, opts.mask_feather_px),
                )
                timer.add("inpaint_ms", started)
                plate_totals["lama_inferences"] = plate_totals.get("lama_inferences", 0) + plate_stats.inferences
                plate_totals["lama_propagated"] = plate_totals.get("lama_propagated", 0) + plate_stats.propagated
                plate_totals["lama_fallbacks"] = plate_totals.get("lama_fallbacks", 0) + plate_stats.fallbacks
                started = time.perf_counter()
                report = quality_score(list(cleaned), masks)
                timer.add("quality_ms", started)
                engine_used = "tbe+lama"


            if report.route == "gpu":
                gpu_recommended = True

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
        engine="tbe" if not (lama and lama.available()) else "tbe+lama",
        chunks=chunk_reports,
        gpu_recommended=gpu_recommended,
    )
