"""Modos de máscara inspirados em projetos open source de remoção.

- `karaoke_union`: legendas karaokê/pulantes mudam de cor e largura a cada
  palavra. Detectar frame a frame faz a máscara "piscar" e sobra resíduo nas
  bordas. A união temporal da janela (mesma ideia usada pelo
  video-subtitle-remover) cobre toda a extensão que o texto ocupa no trecho.
- `lock_region`: marca d'água estática. Votando a região recorrente nos
  primeiros frames (abordagem do IOPaint/watermark-remover) a máscara fica
  travada para o vídeo todo — mais rápido e sem flicker.
"""
from __future__ import annotations

from typing import List, Sequence

import cv2
import numpy as np


def karaoke_union(masks: Sequence[np.ndarray], dilate: int = 3) -> List[np.ndarray]:
    """Une as máscaras da janela e devolve a mesma máscara para todos os frames."""
    if len(masks) == 0:
        return list(masks)
    union = np.zeros_like(masks[0])
    for mask in masks:
        union = np.maximum(union, mask)
    if union.max() == 0:
        return [mask.copy() for mask in masks]
    # Fecha buracos entre palavras destacadas e a linha base.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (31, 5))
    union = cv2.morphologyEx(union, cv2.MORPH_CLOSE, kernel)
    if dilate > 0:
        union = cv2.dilate(
            union, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate * 2 + 1, dilate * 2 + 1))
        )
    return [union.copy() for _ in masks]


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
