"""Modos de máscara inspirados em projetos open source de remoção.

- `karaoke_union`: mantém somente bordas compatíveis em quadros adjacentes,
  sem congelar uma faixa que una palavras de momentos/posições diferentes.
- `lock_region`: marca d'água estática. Votando a região recorrente nos
  primeiros frames (abordagem do IOPaint/watermark-remover) a máscara fica
  travada para o vídeo todo — mais rápido e sem flicker.
"""
from __future__ import annotations

from typing import List, Sequence

import cv2
import numpy as np


def karaoke_union(masks: Sequence[np.ndarray], dilate: int = 3) -> List[np.ndarray]:
    """Stabilize only adjacent, matching glyph masks; never union a whole shot.

    Keep the public name for callers, but do not bridge words, empty frames or
    positions. Text outlines are already included by the pixel detector.
    """
    if len(masks) == 0:
        return list(masks)
    result = []
    radius = max(0, min(1, dilate))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
    for index, mask in enumerate(masks):
        current = mask > 0
        merged = mask.copy()
        if current.any():
            support = cv2.dilate(mask, kernel)
            for neighbor in masks[max(0, index - 1):index + 2]:
                other = neighbor > 0
                union_size = np.count_nonzero(current | other)
                similarity = np.count_nonzero(current & other) / max(1, union_size)
                if similarity >= 0.85:
                    merged = np.maximum(merged, cv2.bitwise_and(neighbor, support))
        result.append(merged)
    return result


def vote_locked_mask(masks: Sequence[np.ndarray], ratio: float = 0.6) -> np.ndarray | None:
    """Região presente em pelo menos `ratio` dos frames — a marca d'água fixa."""
    if len(masks) == 0:
        return None
    stack = np.zeros(masks[0].shape[:2], np.float32)
    for mask in masks:
        stack += (mask > 0).astype(np.float32)
    threshold = max(1.0, len(masks) * float(ratio))
    locked = np.where(stack >= threshold, 255, 0).astype(np.uint8)
    if locked.max() == 0:
        return None
    locked = cv2.morphologyEx(
        locked, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    )
    locked = cv2.dilate(locked, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    return locked


def apply_locked(masks: Sequence[np.ndarray], locked: np.ndarray | None) -> List[np.ndarray]:
    if locked is None:
        return [mask.copy() for mask in masks]
    return [np.maximum(mask, locked) for mask in masks]
