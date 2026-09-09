"""Keep native detail around masks while models operate on one stable video crop.

The rectangle is shared by every frame in a shot. Individual masks, including
empty frames, remain unchanged inside it. Restoration replaces the rectangle;
the caller still applies the native masks for the final selective composite.
"""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
from dataclasses import dataclass
from itertools import zip_longest
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np

from ..utils.video import Probe, read_frames


@dataclass(frozen=True)
class InferenceRegion:
    source_path: str
    mask_dir: str
    width: int
    height: int
    box: tuple[int, int, int, int]
    active: bool
    native_width: int
    native_height: int

    @property
    def cropped(self) -> bool:
        return self.box != (0, 0, self.native_width, self.native_height)


def _check_cancel(cancel_file: str | None) -> None:
    if cancel_file and Path(cancel_file).exists():
        raise RuntimeError("job cancelado")


def _validate_info(info: Probe) -> None:
    if info.width < 2 or info.height < 2 or info.frames < 1:
        raise ValueError("video precisa de dimensoes e quantidade de quadros validas")
    if not math.isfinite(info.fps) or info.fps <= 0:
        raise ValueError("FPS do video invalido")


def _read_mask(path: Path, info: Probe) -> np.ndarray:
    mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise ValueError(f"mascara ausente ou ilegivel: {path.name}")
    if mask.shape != (info.height, info.width):
        raise ValueError(f"dimensoes da mascara {path.name} diferem do video original")
    return mask


def _mask_bounds(mask_dir: Path, info: Probe, cancel_file: str | None):
    if not mask_dir.is_dir():
        raise ValueError("diretorio de mascaras ausente")
    count = sum(1 for path in mask_dir.iterdir() if path.suffix.lower() == ".png")
    if count != info.frames:
        raise ValueError(f"quantidade de mascaras ({count}) difere dos quadros ({info.frames})")
    left, top, right, bottom = info.width, info.height, 0, 0
    for index in range(info.frames):
        _check_cancel(cancel_file)
        mask = _read_mask(mask_dir / f"{index:06d}.png", info)
        x, y, width, height = cv2.boundingRect(mask)
        if width and height:
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x + width), max(bottom, y + height)
    return (left, top, right, bottom) if right > left and bottom > top else None


def _padded_axis(start: int, end: int, limit: int, margin: int) -> tuple[int, int]:
    start, end = max(0, start - margin), min(limit, end + margin)
    # A tiny user mask still needs a valid spatial input for the official models.
    missing = min(32, limit) - (end - start)
    if missing > 0:
        start = max(0, start - (missing + 1) // 2)
        end = min(limit, max(end, start + min(32, limit)))
        start = max(0, min(start, end - min(32, limit)))
    return start // 2 * 2, min(limit, (end + 1) // 2 * 2)


def _write_video(path: Path, width: int, height: int, fps: float,
                 frames: Iterable[np.ndarray]) -> None:
    """Atomically encode an RGB-lossless intermediate, one BGR frame at a time."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.stem}-", suffix=".mp4", dir=path.parent)
    os.close(descriptor)
    process = None
    try:
        # libx264rgb avoids YUV420 chroma loss before the final product encode.
        # stderr is a file rather than a PIPE so an encoder error cannot deadlock.
        with tempfile.TemporaryFile() as error_log:
            process = subprocess.Popen([
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}",
                "-r", str(fps), "-i", "pipe:0", "-an", "-c:v", "libx264rgb",
                "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "bgr24", temporary,
            ], stdin=subprocess.PIPE, stderr=error_log)
            try:
                assert process.stdin is not None
                for frame in frames:
                    if frame.shape != (height, width, 3) or frame.dtype != np.uint8:
                        raise ValueError("quadro de video com dimensoes ou tipo inesperados")
                    process.stdin.write(np.ascontiguousarray(frame).tobytes())
                process.stdin.close()
                process.wait(timeout=60)
            except BaseException:
                process.kill()
                process.wait(timeout=10)
                if process.stdin and not process.stdin.closed:
                    try:
                        process.stdin.close()
                    except BrokenPipeError:
                        pass
                raise
            if process.returncode:
                error_log.seek(0)
                detail = error_log.read(2000).decode("utf-8", errors="replace").strip()
                raise RuntimeError(f"falha ao gravar video da regiao: {detail}")
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def prepare_inference_region(
    input_path: str,
    mask_dir: str,
    job_dir: str,
    info: Probe,
    margin: int = 96,
    cancel_file: str | None = None,
) -> InferenceRegion:
    """Validate native masks and crop their temporal union with context.

    ``active`` means at least one mask contains pixels, so only an inactive
    region can bypass inference. ``cropped`` distinguishes a useful crop from
    full-frame inference. PNG names must be a complete zero-based %06d sequence.
    """
    _validate_info(info)
    _check_cancel(cancel_file)
    if not isinstance(margin, int) or margin < 0:
        raise ValueError("margem da regiao precisa ser um inteiro nao negativo")
    masks = Path(mask_dir)
    bounds = _mask_bounds(masks, info, cancel_file)
    full_box = (0, 0, info.width, info.height)
    box = full_box
    if bounds is not None and info.width % 2 == 0 and info.height % 2 == 0:
        left, right = _padded_axis(bounds[0], bounds[2], info.width, margin)
        top, bottom = _padded_axis(bounds[1], bounds[3], info.height, margin)
        if (right - left) * (bottom - top) < 0.9 * info.width * info.height:
            box = (left, top, right - left, bottom - top)
    if box == full_box:
        return InferenceRegion(str(input_path), str(mask_dir), info.width, info.height,
                               box, bounds is not None, info.width, info.height)

    directory = Path(job_dir)
    directory.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix="inference_region_", dir=directory))
    cropped_masks = directory / "masks"
    cropped_masks.mkdir()
    source = directory / "input.mp4"
    x, y, width, height = box

    def cropped_frames():
        written = 0
        for index, frame in enumerate(read_frames(str(input_path))):
            _check_cancel(cancel_file)
            if index >= info.frames:
                raise ValueError("video original tem mais quadros que as mascaras")
            if frame.shape != (info.height, info.width, 3):
                raise ValueError("dimensoes do video original diferem dos metadados")
            mask = _read_mask(masks / f"{index:06d}.png", info)
            if not cv2.imwrite(str(cropped_masks / f"{index:06d}.png"), mask[y:y + height, x:x + width]):
                raise RuntimeError("falha ao gravar mascara recortada")
            yield frame[y:y + height, x:x + width]
            written += 1
        if written != info.frames:
            raise ValueError(f"video original tem {written} quadros; esperado {info.frames}")

    _write_video(source, width, height, info.fps, cropped_frames())
    return InferenceRegion(str(source), str(cropped_masks), width, height, box, True,
                           info.width, info.height)


def restore_inference_region(
    model_output: str,
    region: InferenceRegion,
    original_path: str,
    output_path: str,
    info: Probe,
    cancel_file: str | None = None,
) -> str:
    """Restore crop at native size; caller composites with the original masks.

    Model FPS metadata can be rounded by its official writer. Frame-count
    validation plus writing at the original FPS preserves timing without
    duplicating or dropping frames. This intermediate intentionally has no audio.
    """
    _validate_info(info)
    _check_cancel(cancel_file)
    if (region.native_width, region.native_height) != (info.width, info.height):
        raise ValueError("regiao nao corresponde as dimensoes do video original")
    x, y, width, height = region.box
    if x < 0 or y < 0 or width < 1 or height < 1 or x + width > info.width or y + height > info.height:
        raise ValueError("regiao fora dos limites do video original")
    destination = Path(output_path).resolve()
    if destination in (Path(model_output).resolve(), Path(original_path).resolve()):
        raise ValueError("saida da restauracao deve ser diferente dos videos de entrada")

    def restored_frames():
        original_frames = read_frames(str(original_path))
        model_frames = read_frames(str(model_output))
        written = 0
        try:
            for original, reconstructed in zip_longest(original_frames, model_frames):
                _check_cancel(cancel_file)
                if original is None or reconstructed is None or written >= info.frames:
                    raise ValueError("quantidade de quadros do motor difere do video original")
                if original.shape != (info.height, info.width, 3):
                    raise ValueError("dimensoes do video original diferem dos metadados")
                if reconstructed.shape[:2] != (height, width):
                    reconstructed = cv2.resize(reconstructed, (width, height), interpolation=cv2.INTER_LANCZOS4)
                original[y:y + height, x:x + width] = reconstructed
                yield original
                written += 1
            if written != info.frames:
                raise ValueError(f"quantidade de quadros restaurados ({written}) difere de {info.frames}")
        finally:
            original_frames.close()
            model_frames.close()

    _write_video(destination, info.width, info.height, info.fps, restored_frames())
    return str(output_path)
