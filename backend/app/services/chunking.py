"""Fatiamento e remontagem de vídeo para a orquestração por chunks.

Cada worker recebe uma janela pertencente a uma única cena. Contexto temporal
é limitado à mesma cena; a montagem descarta o contexto e concatena os miolos.
Não há crossfade artificial entre cenas.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
import math
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
    """Partition every shot, keeping both context edges inside that shot.

    A symmetric overlap is retained for compatibility with queued GPU jobs.
    At a scene boundary it becomes zero, never borrowing another shot.
    """
    duration = float(duration)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("duracao invalida")
    target = max(4.0, float(target_seconds))
    if not math.isfinite(target) or not math.isfinite(overlap) or overlap < 0:
        raise ValueError("parametros de fatiamento invalidos")
    boundaries = [0.0, *sorted({float(c) for c in cuts if 0 < float(c) < duration}), duration]
    counts = [max(1, math.ceil((b - a) / target)) for a, b in zip(boundaries, boundaries[1:])]
    if sum(counts) > max_chunks:
        raise ValueError("muitas cenas/partes; reduza o trecho antes de enviar para GPU")
    chunks: List[Chunk] = []
    for (scene_start, scene_end), count in zip(zip(boundaries, boundaries[1:]), counts):
        for index in range(count):
            start = scene_start + (scene_end - scene_start) * index / count
            end = scene_start + (scene_end - scene_start) * (index + 1) / count
            context = max(0.0, min(overlap, start - scene_start, scene_end - end))
            chunks.append(Chunk(len(chunks), start, end, context))
    return chunks


def slice_video(source: str, destination: str, start: float, duration: float) -> str:
    """Silent GPU input; original audio stays on Hostear until final assembly."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", f"{max(0.0, start):.3f}",
            "-i", source,
            "-t", f"{max(0.1, duration):.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-an",
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
