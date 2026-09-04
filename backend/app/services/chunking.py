"""Fatiamento e remontagem de vídeo para a orquestração por chunks.

A ideia (usada por ProPainter/E2FGVI em produção e pelos pipelines de
inpainting distribuído) é simples: cada worker recebe uma janela do vídeo com
uma pequena sobreposição nas bordas. O overlap dá contexto temporal suficiente
para o inpainting não "piscar" na emenda e permite um crossfade curto na hora
de concatenar.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
import subprocess
from typing import List, Sequence


def localize_masks(masks: Sequence[dict], offset: float, duration: float) -> List[dict]:
    """Converte intervalos absolutos do master para o relogio do recorte."""
    localized: List[dict] = []
    for original in masks:
        if not isinstance(original, dict):
            continue
        region = dict(original)
        start_value = region.get("from", region.get("from_time"))
        end_value = region.get("to", region.get("to_time"))
        if end_value is not None and float(end_value) <= offset:
            continue
        if start_value is not None and float(start_value) >= offset + duration:
            continue
        if start_value is not None:
            region["from"] = max(0.0, float(start_value) - offset)
            region.pop("from_time", None)
        if end_value is not None:
            region["to"] = min(duration, max(0.0, float(end_value) - offset))
            region.pop("to_time", None)
        localized.append(region)
    return localized


@dataclass(frozen=True)
class Chunk:
    index: int
    start: float
    end: float
    overlap: float

    @property
    def read_start(self) -> float:
        return max(0.0, self.start - self.overlap)

    @property
    def read_duration(self) -> float:
        return (self.end + self.overlap) - self.read_start


def plan_chunks(
    duration: float,
    target_seconds: float = 15.0,
    overlap: float = 0.5,
    cuts: Sequence[float] = (),
    max_chunks: int = 64,
) -> List[Chunk]:
    """Divide o vídeo preferindo cortes de cena próximos ao alvo de duração."""
    duration = max(0.1, float(duration))
    target = max(4.0, float(target_seconds))
    if duration <= target * 1.35:
        return [Chunk(0, 0.0, duration, 0.0)]

    ordered = sorted({round(float(c), 3) for c in cuts if 0.0 < float(c) < duration})
    bounds: List[float] = [0.0]
    while bounds[-1] < duration - 1.0:
        ideal = bounds[-1] + target
        if ideal >= duration - 1.0:
            break
        window = target * 0.35
        near = [c for c in ordered if abs(c - ideal) <= window and c > bounds[-1] + 2.0]
        bounds.append(min(near, key=lambda c: abs(c - ideal)) if near else ideal)
        if len(bounds) > max_chunks:
            break
    bounds.append(duration)

    chunks: List[Chunk] = []
    for index in range(len(bounds) - 1):
        chunks.append(Chunk(index, bounds[index], bounds[index + 1], overlap))
    return chunks


def slice_video(source: str, destination: str, start: float, duration: float) -> str:
    """Corte preciso (re-encode) preservando áudio — usado por chunk."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", f"{max(0.0, start):.3f}",
            "-i", source,
            "-t", f"{max(0.1, duration):.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart",
            destination,
        ],
        check=True,
    )
    return destination


def trim_edges(source: str, destination: str, head: float, body: float) -> str:
    """Remove a sobreposição de contexto, deixando apenas o miolo do chunk."""
    if head <= 0.001:
        args = ["-i", source, "-t", f"{max(0.1, body):.3f}"]
    else:
        args = ["-ss", f"{head:.3f}", "-i", source, "-t", f"{max(0.1, body):.3f}"]
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *args,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
         "-movflags", "+faststart", destination],
        check=True,
    )
    return destination


def concat_videos(parts: Sequence[str], destination: str, work_dir: str) -> str:
    """Concatena os chunks já aparados. Tenta stream copy antes de re-encodar."""
    if not parts:
        raise ValueError("nenhum chunk para concatenar")
    if len(parts) == 1:
        os.replace(parts[0], destination)
        return destination
    list_path = os.path.join(work_dir, "concat.txt")
    with open(list_path, "w", encoding="utf-8") as handle:
        for part in parts:
            handle.write(f"file '{os.path.abspath(part)}'\n")
    copy = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", list_path, "-c", "copy", "-movflags", "+faststart", destination],
        capture_output=True,
    )
    if copy.returncode == 0 and os.path.exists(destination):
        return destination
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", list_path,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", destination],
        check=True,
    )
    return destination
