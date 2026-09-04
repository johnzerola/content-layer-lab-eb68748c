#!/usr/bin/env python3
"""Gera clipes sintéticos verticais para calibrar o Clean Engine.

    python scripts/make_test_clips.py samples/

Três casos, exatamente os do critério de aceite:
  1. caption  — legenda branca com stroke preto sobre fundo com textura;
  2. karaoke  — palavra ativa muda de cor/tamanho a cada beat;
  3. motion   — legenda sobre cenário em movimento (câmera panorâmica).

Cada clipe também salva o "ground truth" (mesmo fundo sem texto), o que
permite medir objetivamente se a reconstrução ficou perto do fundo real.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 30
WORDS = ["VOCÊ", "PRECISA", "SABER", "DISSO", "AGORA", "MESMO"]


def _background(width: int, height: int) -> np.ndarray:
    """Fundo com textura real (gradiente + ruído + formas), não cor chapada."""
    rng = np.random.default_rng(7)
    y = np.broadcast_to(np.linspace(0, 1, height, dtype=np.float32)[:, None], (height, width))
    x = np.broadcast_to(np.linspace(0, 1, width, dtype=np.float32)[None, :], (height, width))
    base = np.stack(
        [
            (0.25 + 0.55 * y) * 255,
            (0.35 + 0.35 * x) * 255,
            (0.55 - 0.30 * y) * 255,
        ],
        axis=2,
    ).astype(np.float32)
    noise = rng.normal(0, 9, (height, width, 3)).astype(np.float32)
    canvas = np.clip(base + noise, 0, 255).astype(np.uint8)
    for i in range(26):
        cx = int(rng.integers(0, width))
        cy = int(rng.integers(0, height))
        r = int(rng.integers(40, 190))
        color = tuple(int(c) for c in rng.integers(40, 220, 3))
        cv2.circle(canvas, (cx, cy), r, color, thickness=int(rng.integers(2, 9)))
    for i in range(0, height, 90):
        cv2.line(canvas, (0, i), (width, i + 40), (200, 200, 200), 1)
    return canvas


def _draw_caption(frame: np.ndarray, text: str, y: int, scale: float, color) -> None:
    font = cv2.FONT_HERSHEY_DUPLEX
    (tw, th), _ = cv2.getTextSize(text, font, scale, 3)
    x = (frame.shape[1] - tw) // 2
    cv2.putText(frame, text, (x, y), font, scale, (0, 0, 0), 9, cv2.LINE_AA)  # stroke
    cv2.putText(frame, text, (x, y), font, scale, color, 3, cv2.LINE_AA)      # fill


def _write(path: str, frames):
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE,
    )
    for frame in frames:
        proc.stdin.write(np.ascontiguousarray(frame).tobytes())
    proc.stdin.close()
    proc.wait()


def make_caption(outdir: str, seconds: float = 6.0) -> str:
    plate = _background(W, H)
    clean, dirty = [], []
    for i in range(int(seconds * FPS)):
        base = plate.copy()
        clean.append(base.copy())
        line = WORDS[(i // (FPS * 2)) % len(WORDS)] + " ISSO AQUI"
        _draw_caption(base, line, int(H * 0.78), 2.2, (255, 255, 255))
        dirty.append(base)
    _write(os.path.join(outdir, "caption_truth.mp4"), clean)
    path = os.path.join(outdir, "caption.mp4")
    _write(path, dirty)
    return path


def make_karaoke(outdir: str, seconds: float = 6.0) -> str:
    plate = _background(W, H)
    clean, dirty = [], []
    total = int(seconds * FPS)
    for i in range(total):
        base = plate.copy()
        clean.append(base.copy())
        active = (i // 12) % 3
        words = WORDS[:3]
        font = cv2.FONT_HERSHEY_DUPLEX
        sizes = [cv2.getTextSize(w, font, 2.0, 3)[0][0] for w in words]
        gap = 30
        x = (W - (sum(sizes) + gap * 2)) // 2
        for idx, word in enumerate(words):
            scale = 2.35 if idx == active else 2.0
            color = (60, 220, 255) if idx == active else (255, 255, 255)
            y = int(H * 0.74)
            cv2.putText(base, word, (x, y), font, scale, (0, 0, 0), 10, cv2.LINE_AA)
            cv2.putText(base, word, (x, y), font, scale, color, 3, cv2.LINE_AA)
            x += sizes[idx] + gap
        dirty.append(base)
    _write(os.path.join(outdir, "karaoke_truth.mp4"), clean)
    path = os.path.join(outdir, "karaoke.mp4")
    _write(path, dirty)
    return path


def make_motion(outdir: str, seconds: float = 6.0) -> str:
    plate = _background(W * 2, H)
    clean, dirty = [], []
    total = int(seconds * FPS)
    for i in range(total):
        shift = int((i / total) * W)
        base = plate[:, shift:shift + W].copy()
        clean.append(base.copy())
        _draw_caption(base, "LEGENDA SOBRE MOVIMENTO", int(H * 0.8), 1.7, (255, 255, 255))
        dirty.append(base)
    _write(os.path.join(outdir, "motion_truth.mp4"), clean)
    path = os.path.join(outdir, "motion.mp4")
    _write(path, dirty)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("outdir", nargs="?", default="samples")
    parser.add_argument("--seconds", type=float, default=6.0)
    args = parser.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    for fn in (make_caption, make_karaoke, make_motion):
        path = fn(args.outdir, args.seconds)
        print(f"gerado: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
