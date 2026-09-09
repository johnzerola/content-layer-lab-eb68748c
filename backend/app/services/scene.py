"""Detecção de cortes de cena — máscaras nunca atravessam um corte."""
from __future__ import annotations

from typing import List, Tuple

import cv2
import numpy as np


def detect_scenes(path: str, threshold: float = 0.35, sample_scale: float = 0.25) -> List[Tuple[int, int]]:
    """Retorna [(start, end_exclusive)] por cena, em índices de frame."""
    cap = cv2.VideoCapture(path)
    cuts: List[int] = [0]
    prev_hist = None
    prev_tiles = None
    idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            small = cv2.resize(frame, (0, 0), fx=sample_scale, fy=sample_scale)
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
            # Static letterboxes/headlines can dominate the global histogram.
            # Require change in at least two spatial tiles to detect the inset
            # video's cut without reacting to a small isolated overlay.
            tiles = []
            for row in np.array_split(hsv, 3, axis=0):
                for tile in np.array_split(row, 3, axis=1):
                    if tile.size:
                        tile_hist = cv2.calcHist([tile], [0, 1], None, [32, 32], [0, 180, 0, 256])
                        cv2.normalize(tile_hist, tile_hist, 0, 1, cv2.NORM_MINMAX)
                        tiles.append(tile_hist)
            if prev_hist is not None:
                d = 1.0 - float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL))
                if prev_tiles is not None and len(tiles) >= 2:
                    changes = sorted((1.0 - float(cv2.compareHist(a, b, cv2.HISTCMP_CORREL))
                                      for a, b in zip(prev_tiles, tiles)), reverse=True)
                    d = max(d, changes[1])
                if d > threshold and idx - cuts[-1] > 8:
                    cuts.append(idx)
            prev_hist = hist
            prev_tiles = tiles
            idx += 1
    finally:
        cap.release()

    total = idx
    cuts.append(total)
    return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1) if cuts[i + 1] > cuts[i]]
