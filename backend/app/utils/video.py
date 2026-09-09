"""Leitura/escrita de vídeo preservando resolução, FPS, duração e áudio."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Iterator, List

import cv2
import numpy as np


@dataclass
class Probe:
    width: int
    height: int
    fps: float
    frames: int
    duration: float
    has_audio: bool


def probe(path: str) -> Probe:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_streams", "-show_format", path],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    v = next(s for s in data["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in data["streams"])
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    fps = fps or 30.0
    try:
        frames = int(v.get("nb_frames") or 0)
    except (TypeError, ValueError):
        frames = 0
    if frames <= 0:
        # Matroska/WebM commonly omit nb_frames. Container duration can include
        # a longer audio track, so duration * FPS is not a valid mask count.
        counted = json.loads(subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
             "-show_entries", "stream=nb_read_frames", "-of", "json", path],
            capture_output=True, text=True, check=True,
        ).stdout)
        streams = counted.get("streams") or []
        try:
            frames = int(streams[0].get("nb_read_frames") or 0) if streams else 0
        except (TypeError, ValueError):
            frames = 0
        if frames <= 0:
            raise ValueError("nao foi possivel contar os quadros do video")
    # Some demuxers also populate stream.duration from the container's longer
    # audio span. The frame-based pipeline renders at this FPS, so its actual
    # video duration comes from the decoded frame count, not either duration.
    duration = frames / fps
    return Probe(int(v["width"]), int(v["height"]), fps, frames, duration, has_audio)


def read_frames(path: str) -> Iterator[np.ndarray]:
    cap = cv2.VideoCapture(path)
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            yield frame
    finally:
        cap.release()


def read_chunk(path: str, start: int, count: int) -> List[np.ndarray]:
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    frames: List[np.ndarray] = []
    try:
        for _ in range(count):
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(frame)
    finally:
        cap.release()
    return frames


class RawWriter:
    """Escreve frames BGR crus num pipe ffmpeg (x264, sem perdas visíveis)."""

    def __init__(self, path: str, width: int, height: int, fps: float, crf: int = 16):
        self.proc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "rawvideo", "-pix_fmt", "bgr24",
             "-s", f"{width}x{height}", "-r", f"{fps}", "-i", "pipe:0",
             "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
             "-pix_fmt", "yuv420p", path],
            stdin=subprocess.PIPE,
        )

    def write(self, frame: np.ndarray) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(np.ascontiguousarray(frame).tobytes())

    def close(self) -> None:
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.wait()


def mux_audio(video_only: str, original: str, output: str, has_audio: bool) -> None:
    """Remonta o vídeo processado com o áudio original intacto."""
    if not has_audio:
        try:
            os.replace(video_only, output)
        except OSError:
            # workdir e saída em discos diferentes (tmpfs x volume): copia.
            shutil.copyfile(video_only, output)
            os.remove(video_only)
        return

    command = ["ffmpeg", "-y", "-loglevel", "error",
         "-i", video_only, "-i", original,
         "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "copy", "-c:a", "copy", "-shortest", output]
    try:
        subprocess.run(command, check=True, capture_output=True)
    except subprocess.CalledProcessError:
        # Some source audio codecs cannot be muxed into MP4. Only then encode.
        position = command.index("-c:a") + 1
        command[position:position + 1] = ["aac", "-b:a", "192k"]
        subprocess.run(command, check=True)
    try:
        os.remove(video_only)
    except OSError:
        pass


def ffmpeg_filter(
    source: str,
    destination: str,
    vf: str,
    crf: int = 14,
    preset: str = "slow",
) -> str:
    """Render a filtered copy while preserving original audio."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", source,
            "-vf", vf,
            "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-movflags", "+faststart",
            destination,
        ],
        check=True,
    )
    return destination


def trim_video(source: str, destination: str, seconds: float) -> str:
    """Re-encode apenas os primeiros `seconds` segundos (corte preciso, com áudio)."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", source,
            "-t", f"{max(0.1, seconds):.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart",
            destination,
        ],
        check=True,
    )
    return destination


def composite_masked(
    original: str,
    inpainted: str,
    mask_dir: str,
    fps: float,
    destination: str,
) -> str:
    """Composite seletivo: pixels do original em tudo, do inpainting só na máscara.

    Merge in RGB: a grayscale mask converted to YUV has neutral chroma (128),
    which otherwise blends original subtitle colors back into cleaned pixels.
    Keep the supplied mask opaque and do not blur it into protected pixels.
    """
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", original,
            "-i", inpainted,
            "-framerate", f"{fps:.6f}", "-i", os.path.join(mask_dir, "%06d.png"),
            "-filter_complex",
            "[0:v]format=gbrp[a];[1:v]format=gbrp[b];"
            "[2:v]format=gbrp[m];[a][b][m]maskedmerge,format=yuv420p[v]",
            "-map", "[v]",
            "-c:v", "libx264", "-preset", "slow", "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-shortest",
            destination,
        ],
        check=True,
    )
    return destination


def normalize_video(
    source: str,
    destination: str,
    width: int,
    height: int,
    fps: float,
) -> str:
    """Return a video at the source video's exact display size and frame rate."""
    current = probe(source)
    if current.width == width and current.height == height and abs(current.fps - fps) < 0.02:
        return source
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", source,
            "-vf", f"scale={width}:{height}:flags=lanczos",
            "-r", f"{fps:.6f}",
            "-c:v", "libx264", "-preset", "slow", "-crf", "16",
            "-pix_fmt", "yuv420p", destination,
        ],
        check=True,
    )
    return destination


def masks_to_video(mask_dir: str, destination: str, fps: float) -> str:
    """Encode numbered PNG masks losslessly enough for official model input."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", f"{fps:.6f}",
            "-i", os.path.join(mask_dir, "%06d.png"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "0",
            "-pix_fmt", "yuv420p", "-r", f"{fps:.6f}",
            destination,
        ],
        check=True,
    )
    return destination
