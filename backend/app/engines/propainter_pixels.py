"""Lossless I/O for the upstream runner, without changing model inference.

Only explicit max-side/OOM scaling resamples content. Eight-pixel alignment
uses a replicated border with an equally replicated exclusion mask so text
touching an edge cannot become a supposedly clean reference in the padding.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path
import shutil
import time

import cv2
import numpy as np

from ..services.inference_region import _write_video
from ..utils.video import probe, read_frames


@dataclass(frozen=True)
class PixelGeometry:
    width: int
    height: int
    content_width: int
    content_height: int
    padded_width: int
    padded_height: int


def pixel_geometry(width: int, height: int, max_side: int) -> PixelGeometry:
    if width < 8 or height < 8 or max_side < 8:
        raise ValueError("invalid ProPainter geometry")
    limit = max_side // 8 * 8
    scale = min(1., limit / max(width, height))
    w, h = max(8, round(width * scale)), max(8, round(height * scale))
    return PixelGeometry(width, height, w, h, (w + 7) // 8 * 8, (h + 7) // 8 * 8)


def check_running(cancel_file=None, deadline=None):
    if cancel_file and Path(cancel_file).exists():
        raise RuntimeError("job cancelado")
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError("ProPainter excedeu o tempo total")


def prepare_pixels(source: str, masks: str, directory: Path, geometry: PixelGeometry,
                   *, cancel_file=None, deadline=None, max_bytes=2 * 1024**3) -> int:
    info = probe(source)
    g = geometry
    if (info.width, info.height) != (g.width, g.height) or info.frames < 1:
        raise ValueError("ProPainter input geometry mismatch")
    # Conservative budget: input/output PNG, masks, packed RGB video, overhead.
    required = info.frames * g.padded_width * g.padded_height * 16
    if required > max_bytes or shutil.disk_usage(directory).free < required + 256 * 1024**2:
        raise RuntimeError("insufficient lossless workspace budget; reduce the scene length")
    expected = {f"{i:06d}.png" for i in range(info.frames)}
    if {p.name for p in Path(masks).iterdir()} != expected:
        raise ValueError("invalid ProPainter mask sequence")
    frame_dir, mask_dir = directory / "input", directory / "masks"
    frame_dir.mkdir()
    mask_dir.mkdir()
    count = 0
    stream = read_frames(source)
    try:
        for i, frame in enumerate(stream):
            check_running(cancel_file, deadline)
            if i >= info.frames or frame.shape != (g.height, g.width, 3):
                raise ValueError("ProPainter input frame mismatch")
            mask = cv2.imread(str(Path(masks) / f"{i:06d}.png"), 0)
            if mask is None or mask.shape != (g.height, g.width):
                raise ValueError("invalid ProPainter mask geometry")
            if (g.content_width, g.content_height) != (g.width, g.height):
                frame = cv2.resize(frame, (g.content_width, g.content_height), interpolation=cv2.INTER_AREA)
                mask = cv2.resize(mask, (g.content_width, g.content_height), interpolation=cv2.INTER_NEAREST)
            bottom, right = g.padded_height - g.content_height, g.padded_width - g.content_width
            frame = cv2.copyMakeBorder(frame, 0, bottom, 0, right, cv2.BORDER_REPLICATE)
            mask = cv2.copyMakeBorder(mask, 0, bottom, 0, right, cv2.BORDER_REPLICATE)
            if not cv2.imwrite(str(frame_dir / f"{i:06d}.png"), frame) or not cv2.imwrite(str(mask_dir / f"{i:06d}.png"), mask):
                raise RuntimeError("failed to write lossless ProPainter input")
            count += 1
    finally:
        stream.close()
    if count != info.frames:
        raise ValueError("incomplete ProPainter input")
    return count


def pack_pixels(frames_dir: Path, destination: Path, geometry: PixelGeometry,
                count: int, fps: float, *, cancel_file=None, deadline=None) -> str:
    g = geometry
    if count < 1 or not math.isfinite(fps) or fps <= 0:
        raise ValueError("invalid ProPainter output timing")
    expected = {f"{i:04d}.png" for i in range(count)}
    if not frames_dir.is_dir() or {p.name for p in frames_dir.iterdir()} != expected:
        raise ValueError("incomplete ProPainter lossless output; refusing lossy fallback")

    def frames():
        for i in range(count):
            check_running(cancel_file, deadline)
            # Upstream converts internal RGB to BGR before cv2.imwrite.
            frame = cv2.imread(str(frames_dir / f"{i:04d}.png"), cv2.IMREAD_UNCHANGED)
            if frame is None or frame.shape != (g.padded_height, g.padded_width, 3) or frame.dtype != np.uint8:
                raise ValueError("invalid ProPainter output frame")
            frame = frame[:g.content_height, :g.content_width]
            if (g.content_width, g.content_height) != (g.width, g.height):
                frame = cv2.resize(frame, (g.width, g.height), interpolation=cv2.INTER_LANCZOS4)
            yield frame

    _write_video(destination, g.width, g.height, fps, frames())
    return str(destination)


def write_pixel_report(path: Path, geometry: PixelGeometry, count: int, fps: float,
                       attempt: int) -> None:
    path.write_text(json.dumps({
        "revision": "propainter-pixels-v1", **asdict(geometry), "frames": count,
        "fps": fps, "attempt": attempt,
        "resampled": (geometry.width, geometry.height) != (geometry.content_width, geometry.content_height),
        "model_output": "upstream PNG to RGB lossless", "padding": "right/bottom replicate",
    }, indent=2), encoding="utf-8")
