"""Reconstrução por placa de fundo: LaMa em keyframes + propagação.

Motivo: em CPU cada inferência LaMa 512x512 custa ~5s. Rodar em todos os frames
é inviável, e rodar em nenhum devolve o borrão que queremos evitar.

Solução: reconstruir o fundo com LaMa em poucos keyframes e propagar essa placa
limpa para os frames vizinhos com alinhamento geométrico (homografia estimada
fora da máscara). O que muda entre frames vizinhos é a câmera, não o fundo —
então a placa alinhada é fundo real, não invenção.

Se o alinhamento não for confiável em um frame, ele mantém o resultado temporal
já existente em vez de colar conteúdo errado.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence

import cv2
import numpy as np


@dataclass
class PlateStats:
    keyframes: int = 0
    propagated: int = 0
    fallbacks: int = 0
    inferences: int = 0

    def as_dict(self) -> dict:
        return {
            "lama_keyframes": self.keyframes,
            "lama_propagated": self.propagated,
            "lama_fallbacks": self.fallbacks,
            "lama_inferences": self.inferences,
        }


def keyframe_indices(total: int, budget: int, motion: Sequence[float] | None = None) -> List[int]:
    """Escolhe até `budget` keyframes, priorizando trechos de maior mudança."""
    if total <= 0 or budget <= 0:
        return []
    if total <= budget:
        return list(range(total))
    stride = max(1, total // budget)
    base = list(range(0, total, stride))[:budget]
    if motion is not None and len(motion) == total and len(base) > 1:
        # Realoca cada keyframe para o frame de maior movimento na sua vizinhança:
        # é onde a placa antiga envelhece mais rápido.
        half = max(1, stride // 2)
        moved = []
        for idx in base:
            lo, hi = max(0, idx - half), min(total, idx + half + 1)
            window = list(motion[lo:hi])
            moved.append(lo + int(np.argmax(window)))
        base = sorted(set(moved))
    return base


def _align(source: np.ndarray, target: np.ndarray, valid: np.ndarray) -> Optional[np.ndarray]:
    """Homografia que leva `source` para o enquadramento de `target`."""
    src_gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    dst_gray = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(1200)
    kp1, des1 = orb.detectAndCompute(src_gray, valid)
    kp2, des2 = orb.detectAndCompute(dst_gray, valid)
    if des1 is None or des2 is None or len(kp1) < 12 or len(kp2) < 12:
        return None
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = sorted(matcher.match(des1, des2), key=lambda m: m.distance)[:200]
    if len(matches) < 12:
        return None
    src = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    matrix, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if matrix is None or inliers is None or int(inliers.sum()) < 10:
        return None
    return matrix


def _blend(base: np.ndarray, patch: np.ndarray, mask: np.ndarray, feather: int) -> np.ndarray:
    alpha = (mask > 0).astype(np.float32)
    k = max(3, feather | 1)
    alpha = cv2.GaussianBlur(alpha, (k, k), 0)[..., None]
    return (base.astype(np.float32) * (1 - alpha) + patch.astype(np.float32) * alpha).astype(np.uint8)


def reconstruct_with_plates(
    frames: Sequence[np.ndarray],
    masks: Sequence[np.ndarray],
    temporal_result: Sequence[np.ndarray],
    provider,
    budget: int = 2,
    feather: int = 5,
) -> tuple[np.ndarray, PlateStats]:
    """Devolve os frames reconstruídos e as estatísticas da propagação."""
    stats = PlateStats()
    total = len(frames)
    if total == 0 or provider is None:
        return np.asarray(temporal_result), stats

    motion = _motion_profile(frames)
    keys = keyframe_indices(total, budget, motion)
    if not keys:
        return np.asarray(temporal_result), stats

    # A placa precisa estar limpa em TODA área que qualquer frame do trecho
    # cobre — senão o keyframe carrega texto de outro frame ao ser propagado.
    union = np.zeros_like(np.asarray(masks[0]))
    for mask in masks:
        if mask is not None:
            union = np.maximum(union, (np.asarray(mask) > 0).astype(union.dtype) * 255)
    union = cv2.dilate(union, np.ones((5, 5), np.uint8), iterations=1)

    plates: dict[int, np.ndarray] = {}
    for idx in keys:
        # A base é o resultado temporal: o LaMa só precisa fechar o que sobrou.
        plate = provider.process(np.ascontiguousarray(temporal_result[idx]), union)
        plates[idx] = plate
        stats.keyframes += 1
        stats.inferences += 1

    output: List[np.ndarray] = []
    for i in range(total):
        # A composição usa a união: toda a área que o motor temporal tocou
        # precisa receber a placa reconstruída, senão sobram blocos borrados
        # ao lado do texto.
        mask = union if union.max() > 0 else masks[i]
        if mask is None or mask.max() == 0:
            output.append(np.asarray(temporal_result[i]))
            continue
        if i in plates:
            output.append(plates[i])
            continue

        nearest = min(keys, key=lambda k: abs(k - i))
        plate = plates[nearest]
        valid = cv2.bitwise_not(cv2.dilate(union, np.ones((9, 9), np.uint8), iterations=1))
        warped: Optional[np.ndarray]
        if motion[i] < 0.004 and motion[nearest] < 0.004:
            warped = plate  # cena parada: nem precisa alinhar
        else:
            matrix = _align(frames[nearest], frames[i], valid)
            warped = (
                cv2.warpPerspective(plate, matrix, (plate.shape[1], plate.shape[0]),
                                    flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                if matrix is not None else None
            )
        if warped is None:
            stats.fallbacks += 1
            output.append(np.asarray(temporal_result[i]))
            continue
        output.append(_blend(np.asarray(temporal_result[i]), warped, mask, feather))
        stats.propagated += 1

    return np.asarray(output), stats


def _motion_profile(frames: Sequence[np.ndarray]) -> List[float]:
    """Movimento relativo de cada frame em relação ao anterior (0..1)."""
    profile: List[float] = [0.0]
    prev = None
    for frame in frames:
        small = cv2.resize(frame, (128, 72), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None:
            profile.append(float(np.abs(gray - prev).mean()) / 255.0)
        prev = gray
    return profile[:len(frames)] or [0.0] * len(frames)
