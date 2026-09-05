"""Tracking temporal da máscara por optical flow (Farneback).

Objetivo: a máscara não pisca nem muda de tamanho sozinha. Se a legenda se
move, a máscara acompanha; se fica parada, ela é estabilizada.
"""
from __future__ import annotations

from typing import List, Sequence, Tuple

import cv2
import numpy as np


_FLOW_WIDTH = 384


def _flow(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Farneback em escala reduzida: mesmo transporte, custo ~10x menor na CPU."""
    h, w = src.shape[:2]
    scale = min(1.0, _FLOW_WIDTH / float(w))
    if scale < 1.0:
        small_src = cv2.resize(src, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        small_dst = cv2.resize(dst, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        small_src, small_dst = src, dst
    flow = cv2.calcOpticalFlowFarneback(small_src, small_dst, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    if scale < 1.0:
        flow = cv2.resize(flow, (w, h), interpolation=cv2.INTER_LINEAR) / scale
    return flow


def _warp(mask: np.ndarray, flow: np.ndarray) -> np.ndarray:
    h, w = mask.shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x = grid_x + flow[..., 0]
    map_y = grid_y + flow[..., 1]
    return cv2.remap(mask, map_x, map_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT)


def _transport(mask: np.ndarray, current: np.ndarray, neighbor: np.ndarray) -> np.ndarray:
    """Transport a mask using flow calculated only around its active region."""
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        return np.zeros_like(mask)
    h, w = mask.shape[:2]
    margin = max(24, int(round(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.2)))
    x0, x1 = max(0, int(xs.min()) - margin), min(w, int(xs.max()) + 1 + margin)
    y0, y1 = max(0, int(ys.min()) - margin), min(h, int(ys.max()) + 1 + margin)
    flow = _flow(current[y0:y1, x0:x1], neighbor[y0:y1, x0:x1])
    result = np.zeros_like(mask)
    result[y0:y1, x0:x1] = _warp(mask[y0:y1, x0:x1], flow)
    return result



def propagate(
    frames: Sequence[np.ndarray],
    seed_mask: np.ndarray,
    seed_index: int = 0,
) -> List[np.ndarray]:
    """Propaga uma máscara para frente e para trás dentro de uma cena."""
    n = len(frames)
    out: List[np.ndarray] = [np.zeros_like(seed_mask) for _ in range(n)]
    out[seed_index] = seed_mask.copy()
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]

    for i in range(seed_index + 1, n):
        out[i] = _transport(out[i - 1], grays[i], grays[i - 1])

    for i in range(seed_index - 1, -1, -1):
        out[i] = _transport(out[i + 1], grays[i], grays[i + 1])

    return out


def stabilize(masks: np.ndarray, window: int = 5, motion_thresh: float = 0.02) -> np.ndarray:
    """Suaviza a máscara no tempo: dissolve piscadas e prende regiões estáticas."""
    t = len(masks)
    if t < 3:
        return masks
    out = masks.copy()
    half = max(1, window // 2)
    for i in range(t):
        lo, hi = max(0, i - half), min(t, i + half + 1)
        stack = masks[lo:hi].astype(np.float32) / 255.0
        avg = stack.mean(axis=0)
        keep = (avg >= 0.5) | (masks[i] > 0) & (avg >= 0.3)
        out[i] = np.where(keep, 255, 0).astype(np.uint8)

    # se o conteúdo é praticamente estático, congela a união (evita respirar)
    diffs = [float(np.mean(np.abs(masks[i].astype(np.int16) - masks[i - 1].astype(np.int16))) / 255.0)
             for i in range(1, t)]
    if diffs and float(np.mean(diffs)) < motion_thresh:
        union = np.max(masks, axis=0)
        out[:] = union[None, ...]
    return out


def static_regions(path_frames: Sequence[np.ndarray], min_ratio: float = 0.7) -> np.ndarray:
    """Pixels que quase não mudam ao longo do tempo — típico de watermark fixa."""
    if not path_frames:
        return np.zeros((1, 1), np.uint8)
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in path_frames]
    stack = np.stack(grays, axis=0)
    std = stack.std(axis=0)
    edges = np.mean([cv2.Canny(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), 80, 200).astype(np.float32) / 255.0
                     for f in path_frames], axis=0)
    static = ((std < 6.0) & (edges > (1.0 - min_ratio))).astype(np.uint8) * 255
    return cv2.morphologyEx(static, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (15, 9)))


def interpolate_keyframes(
    frames: Sequence[np.ndarray],
    keys: Sequence[int],
    key_masks: Sequence[np.ndarray],
) -> List[np.ndarray]:
    """Máscara por frame a partir de máscaras calculadas em frames-chave.

    Entre dois keyframes a máscara é transportada por optical flow nos dois
    sentidos e unida, para não perder texto que entra ou sai no meio.
    """
    n = len(frames)
    if not keys:
        return [np.zeros(frames[0].shape[:2], np.uint8) for _ in range(n)]
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
    out: List[np.ndarray] = [np.zeros(frames[0].shape[:2], np.uint8) for _ in range(n)]
    for k, m in zip(keys, key_masks):
        if 0 <= k < n:
            out[k] = np.maximum(out[k], m)

    key_set = sorted(set(int(k) for k in keys if 0 <= k < n))
    for a, b in zip(key_set, key_set[1:]):
        if b - a <= 1:
            continue
        fwd = out[a].copy()
        for i in range(a + 1, b):
            fwd = _transport(fwd, grays[i], grays[i - 1])
            out[i] = np.maximum(out[i], fwd)
        bwd = out[b].copy()
        for i in range(b - 1, a, -1):
            bwd = _transport(bwd, grays[i], grays[i + 1])
            out[i] = np.maximum(out[i], bwd)

    first, last = key_set[0], key_set[-1]
    cur = out[first].copy()
    for i in range(first - 1, -1, -1):
        cur = _transport(cur, grays[i], grays[i + 1])
        out[i] = np.maximum(out[i], cur)
    cur = out[last].copy()
    for i in range(last + 1, n):
        cur = _transport(cur, grays[i], grays[i - 1])
        out[i] = np.maximum(out[i], cur)
    return out
