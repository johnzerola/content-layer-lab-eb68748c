"""Pipelines por tipo de elemento.

Todos compartilham o mesmo núcleo (`clean_pipeline.clean_video`); o que muda é
o modo de máscara e o preset de qualidade. O modo `auto` decide sozinho olhando
uma amostra do vídeo.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Optional

import cv2
import numpy as np

from ..providers.rapidocr_provider import RapidOcrTextDetector
from ..video.proxy import build_proxy
from ..utils.video import probe
from .caption_zone import group_karaoke_lines, scan_zone
from .clean_pipeline import CleanOptions, CleanResult, clean_video


def run_caption(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    return clean_video(source, output, replace(options, mode="caption"), on_progress)


def run_karaoke(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    # Karaokê muda cor/tamanho por palavra: máscara um pouco maior evita rastro
    # de stroke e glow entre uma palavra e a seguinte.
    tuned = replace(
        options,
        mode="karaoke",
        mask_expand_px=max(options.mask_expand_px, 6),
        mask_feather_px=max(options.mask_feather_px, 4),
    )
    return clean_video(source, output, tuned, on_progress)


def run_static_text(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    return clean_video(source, output, replace(options, mode="text"), on_progress)


def run_static_logo(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    return clean_video(source, output, replace(options, mode="logo"), on_progress)


def run_object(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    """Remoção de objeto apontado pelo usuário (SAM2 + Protect Area).

    Exige `options.selection`. Objeto costuma ter borda mais complexa que
    glifo de legenda, então a máscara nasce um pouco mais larga.
    """
    tuned = replace(
        options,
        mode="object",
        mask_expand_px=max(options.mask_expand_px, 6),
        mask_feather_px=max(options.mask_feather_px, 4),
    )
    return clean_video(source, output, tuned, on_progress)


def analyse(source: str, workdir: Optional[str] = None) -> dict:
    """Amostra o vídeo e sugere modo/qualidade — base do modo automático."""
    info = probe(source)
    import tempfile

    proxy = build_proxy(source, workdir or tempfile.mkdtemp(prefix="vaiviral-auto-"), 480, master=info)
    detector = RapidOcrTextDetector()
    scan = scan_zone(proxy.path, detector, step=max(5, int(info.fps // 2)), max_samples=16)

    boxes = [b for frame_boxes in scan.boxes_per_frame.values() for b in frame_boxes]
    per_frame = [len(v) for v in scan.boxes_per_frame.values() if v]
    grouped = [len(group_karaoke_lines(v)) for v in scan.boxes_per_frame.values() if v]

    # Muitas caixas por linha que variam de frame para frame = karaokê.
    fragmentation = 0.0
    if per_frame and grouped:
        fragmentation = float(np.mean(per_frame)) / max(1.0, float(np.mean(grouped)))

    bottom_ratio = 0.0
    if boxes and scan.heat is not None:
        h = scan.heat.shape[0]
        centers = [b[1] + b[3] / 2 for b in boxes]
        bottom_ratio = float(np.mean([c > h * 0.55 for c in centers]))

    motion = _motion_level(proxy.path)

    if not boxes:
        mode = "logo"
    elif fragmentation >= 1.8 and scan.hit_rate > 0.5:
        mode = "karaoke"
    elif bottom_ratio >= 0.6:
        mode = "caption"
    else:
        mode = "text"

    quality = "fast"
    if motion > 0.045 or scan.hit_rate < 0.4:
        quality = "high"
    if motion > 0.09:
        quality = "max"

    return {
        "mode": mode,
        "quality": quality,
        "hit_rate": round(scan.hit_rate, 3),
        "fragmentation": round(fragmentation, 2),
        "bottom_ratio": round(bottom_ratio, 2),
        "motion": round(motion, 4),
        "zone": scan.zone.to_percent(proxy.width, proxy.height) if scan.zone else None,
        "duration": round(info.duration, 2),
        "resolution": f"{info.width}x{info.height}",
    }


def run_auto(source: str, output: str, options: CleanOptions, on_progress=None) -> CleanResult:
    hint = analyse(source, options.workdir)
    tuned = replace(options, mode=hint["mode"], quality=hint["quality"])
    if hint["mode"] == "karaoke":
        return run_karaoke(source, output, tuned, on_progress)
    result = clean_video(source, output, tuned, on_progress)
    result.metrics["auto_mode"] = hint["mode"]  # type: ignore[assignment]
    return result


def _motion_level(path: str, samples: int = 12) -> float:
    """Movimento médio entre frames amostrados (0..1)."""
    cap = cv2.VideoCapture(path)
    prev = None
    diffs = []
    index = 0
    try:
        while len(diffs) < samples:
            ok, frame = cap.read()
            if not ok:
                break
            if index % 5 == 0:
                small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
                if prev is not None:
                    diffs.append(float(np.abs(gray - prev).mean()) / 255.0)
                prev = gray
            index += 1
    finally:
        cap.release()
    return float(np.mean(diffs)) if diffs else 0.0


RUNNERS_BY_MODE = {
    "caption": run_caption,
    "karaoke": run_karaoke,
    "text": run_static_text,
    "logo": run_static_logo,
    "object": run_object,
    "auto": run_auto,
}
