"""ROI — Region Of Interest.

Se a legenda ocupa a faixa inferior, não faz sentido pagar OCR, fluxo óptico e
inpainting no frame inteiro. O motor recorta a ROI (+ margem de contexto),
processa só esse retângulo e devolve o resultado sobre o master com uma borda
suavizada, de forma que a área intocada permanece bit a bit igual ao original.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class Roi:
    x: int
    y: int
    w: int
    h: int

    @classmethod
    def from_percent(
        cls, x: float, y: float, w: float, h: float, width: int, height: int
    ) -> "Roi":
        return cls(
            int(round(x * width)),
            int(round(y * height)),
            int(round(w * width)),
            int(round(h * height)),
        ).clip(width, height)

    @classmethod
    def full(cls, width: int, height: int) -> "Roi":
        return cls(0, 0, width, height)

    def to_percent(self, width: int, height: int) -> dict:
        return {
            "x": round(self.x / width, 4),
            "y": round(self.y / height, 4),
            "w": round(self.w / width, 4),
            "h": round(self.h / height, 4),
        }

    def clip(self, width: int, height: int) -> "Roi":
        x = max(0, min(self.x, width - 1))
        y = max(0, min(self.y, height - 1))
        w = max(1, min(self.w, width - x))
        h = max(1, min(self.h, height - y))
        return Roi(x, y, w, h)

    def expand(self, px: int, width: int, height: int) -> "Roi":
        return Roi(self.x - px, self.y - px, self.w + px * 2, self.h + px * 2).clip(width, height)

    def scaled(self, factor: float, width: int, height: int) -> "Roi":
        return Roi(
            int(round(self.x * factor)),
            int(round(self.y * factor)),
            int(round(self.w * factor)),
            int(round(self.h * factor)),
        ).clip(width, height)

    def even(self, width: int, height: int) -> "Roi":
        """Largura/altura pares — exigido por vários encoders e modelos."""
        w = self.w - (self.w % 2)
        h = self.h - (self.h % 2)
        return Roi(self.x, self.y, max(2, w), max(2, h)).clip(width, height)

    @property
    def area(self) -> int:
        return self.w * self.h

    def coverage(self, width: int, height: int) -> float:
        return self.area / float(max(1, width * height))

    def crop(self, frame: np.ndarray) -> np.ndarray:
        return frame[self.y:self.y + self.h, self.x:self.x + self.w]

    def paste(self, frame: np.ndarray, patch: np.ndarray, feather: int = 0) -> np.ndarray:
        """Compõe o recorte processado de volta no master (cópia, não in-place)."""
        out = frame.copy()
        if patch.shape[:2] != (self.h, self.w):
            patch = cv2.resize(patch, (self.w, self.h), interpolation=cv2.INTER_LANCZOS4)
        if feather <= 0:
            out[self.y:self.y + self.h, self.x:self.x + self.w] = patch
            return out
        alpha = np.ones((self.h, self.w), np.float32)
        k = max(1, min(feather, self.h // 4, self.w // 4))
        ramp = np.linspace(0.0, 1.0, k, dtype=np.float32)
        alpha[:k, :] *= ramp[:, None]
        alpha[-k:, :] *= ramp[::-1][:, None]
        alpha[:, :k] *= ramp[None, :]
        alpha[:, -k:] *= ramp[::-1][None, :]
        base = out[self.y:self.y + self.h, self.x:self.x + self.w].astype(np.float32)
        blended = base * (1.0 - alpha[..., None]) + patch.astype(np.float32) * alpha[..., None]
        out[self.y:self.y + self.h, self.x:self.x + self.w] = blended.astype(np.uint8)
        return out


def union(boxes: Sequence[Roi]) -> Optional[Roi]:
    if not boxes:
        return None
    x0 = min(b.x for b in boxes)
    y0 = min(b.y for b in boxes)
    x1 = max(b.x + b.w for b in boxes)
    y1 = max(b.y + b.h for b in boxes)
    return Roi(x0, y0, x1 - x0, y1 - y0)


def from_mask(mask: np.ndarray, margin: int = 24) -> Optional[Roi]:
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        return None
    height, width = mask.shape[:2]
    return Roi(
        int(xs.min()) - margin,
        int(ys.min()) - margin,
        int(xs.max() - xs.min()) + 1 + margin * 2,
        int(ys.max() - ys.min()) + 1 + margin * 2,
    ).clip(width, height)


def from_boxes(
    boxes: Iterable[Tuple[int, int, int, int]], width: int, height: int, margin: int = 16
) -> Optional[Roi]:
    items: List[Roi] = [Roi(x, y, w, h) for (x, y, w, h) in boxes]
    merged = union(items)
    if merged is None:
        return None
    return merged.expand(margin, width, height)
