"""Descoberta da zona de legenda por amostragem.

OCR em todos os pixels de todos os frames é o maior desperdício de CPU do
motor. Aqui só uma amostra de frames (0, 15, 30, 45…) é analisada no proxy;
as caixas que se repetem definem a `caption_zone`, e o resto do vídeo é
vigiado só dentro dela.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np

from ..video.roi import Roi

Box = Tuple[int, int, int, int]


@dataclass
class ZoneScan:
    zone: Optional[Roi]
    boxes_per_frame: dict
    sampled: int
    hit_rate: float
    heat: Optional[np.ndarray] = None

    def as_dict(self, width: int, height: int) -> dict:
        return {
            "zone": self.zone.to_percent(width, height) if self.zone else None,
            "sampled_frames": self.sampled,
            "hit_rate": round(self.hit_rate, 3),
        }


def scan_zone(
    proxy_path: str,
    detector,
    step: int = 15,
    max_samples: int = 40,
    min_hits: float = 0.15,
    subtitle_only: bool = False,
    margin_ratio: float = 0.04,
) -> ZoneScan:
    """Roda o detector em frames amostrados e devolve a zona quente."""
    cap = cv2.VideoCapture(proxy_path)
    heat: Optional[np.ndarray] = None
    boxes_per_frame: dict = {}
    sampled = 0
    hits = 0
    index = 0
    try:
        while sampled < max_samples:
            ok, frame = cap.read()
            if not ok:
                break
            if index % max(1, step) == 0:
                height, width = frame.shape[:2]
                if heat is None:
                    heat = np.zeros((height, width), np.float32)
                boxes = [b for b in detector.detect(frame) if _plausible(b, width, height)]
                if subtitle_only:
                    boxes = [b for b in boxes if (b[1] + b[3] / 2) > height * 0.42]
                boxes_per_frame[index] = boxes
                if boxes:
                    hits += 1
                    for (x, y, w, h) in boxes:
                        heat[max(0, y):y + h, max(0, x):x + w] += 1.0
                sampled += 1
            index += 1
    finally:
        cap.release()

    if heat is None or sampled == 0 or hits == 0:
        return ZoneScan(None, boxes_per_frame, sampled, 0.0, heat)

    hit_rate = hits / float(sampled)
    threshold = max(1.0, hits * min_hits)
    binary = (heat >= threshold).astype(np.uint8) * 255
    if binary.max() == 0:
        binary = (heat > 0).astype(np.uint8) * 255

    height, width = binary.shape[:2]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, width // 20) | 1, 9))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    ys, xs = np.where(binary > 0)
    margin = int(round(max(width, height) * margin_ratio))
    zone = Roi(
        int(xs.min()) - margin,
        int(ys.min()) - margin,
        int(xs.max() - xs.min()) + 1 + margin * 2,
        int(ys.max() - ys.min()) + 1 + margin * 2,
    ).clip(width, height)
    return ZoneScan(zone, boxes_per_frame, sampled, hit_rate, heat)


def _plausible(box: Box, width: int, height: int) -> bool:
    x, y, w, h = box
    if w <= 2 or h <= 2:
        return False
    if w * h > width * height * 0.6:
        return False
    if h > height * 0.5:
        return False
    return True


def group_karaoke_lines(boxes: List[Box], tolerance: float = 0.7) -> List[Box]:
    """Une palavras/sílabas da mesma linha num único `karaoke_group`.

    Sem isto, cada highlight vira uma caixa diferente e a máscara pisca —
    o efeito karaokê deixa rastro entre uma palavra e outra.
    """
    if not boxes:
        return []
    items = sorted(boxes, key=lambda b: (b[1], b[0]))
    lines: List[List[Box]] = [[items[0]]]
    for box in items[1:]:
        current = lines[-1]
        ref_y = float(np.mean([b[1] + b[3] / 2 for b in current]))
        ref_h = float(np.mean([b[3] for b in current]))
        if abs((box[1] + box[3] / 2) - ref_y) <= ref_h * tolerance:
            current.append(box)
        else:
            lines.append([box])
    grouped: List[Box] = []
    for line in lines:
        x0 = min(b[0] for b in line)
        y0 = min(b[1] for b in line)
        x1 = max(b[0] + b[2] for b in line)
        y1 = max(b[1] + b[3] for b in line)
        grouped.append((x0, y0, x1 - x0, y1 - y0))
    return grouped
