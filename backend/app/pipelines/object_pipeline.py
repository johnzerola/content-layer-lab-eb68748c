"""Pipeline de OBJETOS: seleção promptável + propagação temporal.

Diferença para o pipeline de legenda: aqui não existe OCR. O usuário aponta o
que quer remover (clique ou caixa), o `SegmentationProvider` devolve a máscara
do objeto naquele frame e a máscara é propagada pelo chunk por optical flow,
com re-segmentação periódica para não escorregar.

Este módulo só produz máscara — a reconstrução do fundo continua sendo do
`clean_pipeline` (TBE + LaMa/GPU). Assim, objeto e legenda compartilham o mesmo
motor de preenchimento e o mesmo quality check.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from ..services import tracking

Box = Tuple[int, int, int, int]
Point = Tuple[int, int, int]


@dataclass
class Selection:
    """O que o usuário apontou, em percentual do frame (0..1)."""

    boxes: List[Tuple[float, float, float, float]] = field(default_factory=list)
    points: List[Tuple[float, float, int]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: Optional[dict]) -> "Selection":
        raw = raw or {}
        boxes = [tuple(float(v) for v in b[:4]) for b in (raw.get("boxes") or [])]
        points = [
            (float(p[0]), float(p[1]), int(p[2]) if len(p) > 2 else 1)
            for p in (raw.get("points") or [])
        ]
        return cls(boxes, points)  # type: ignore[arg-type]

    @property
    def empty(self) -> bool:
        return not self.boxes and not self.points

    def bbox_percent(self, margin: float = 0.06) -> Optional[Tuple[float, float, float, float]]:
        """Envelope da seleção, para o motor recortar a ROI e não varrer o frame."""
        xs: List[float] = []
        ys: List[float] = []
        for (x, y, w, h) in self.boxes:
            xs += [x, x + w]
            ys += [y, y + h]
        for (x, y, _label) in self.points:
            xs += [x - 0.08, x + 0.08]
            ys += [y - 0.08, y + 0.08]
        if not xs:
            return None
        x0 = max(0.0, min(xs) - margin)
        y0 = max(0.0, min(ys) - margin)
        x1 = min(1.0, max(xs) + margin)
        y1 = min(1.0, max(ys) + margin)
        return (x0, y0, x1 - x0, y1 - y0)

    def to_pixels(self, width: int, height: int, offset_x: int = 0, offset_y: int = 0) -> dict:
        """Converte para pixels de um recorte (ROI) do frame."""
        boxes: List[Box] = []
        for (x, y, w, h) in self.boxes:
            boxes.append(
                (
                    int(round(x * width)) - offset_x,
                    int(round(y * height)) - offset_y,
                    max(2, int(round(w * width))),
                    max(2, int(round(h * height))),
                )
            )
        points: List[Point] = [
            (int(round(x * width)) - offset_x, int(round(y * height)) - offset_y, int(label))
            for (x, y, label) in self.points
        ]
        return {"boxes": boxes, "points": points}


@dataclass
class ObjectMaskStats:
    segmentations: int = 0
    propagated: int = 0
    engine: str = "grabcut"
    coverage: float = 0.0


def _bbox_of(mask: np.ndarray, margin: int = 6) -> Optional[Box]:
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        return None
    h, w = mask.shape[:2]
    x0 = max(0, int(xs.min()) - margin)
    y0 = max(0, int(ys.min()) - margin)
    x1 = min(w - 1, int(xs.max()) + margin)
    y1 = min(h - 1, int(ys.max()) + margin)
    return (x0, y0, x1 - x0, y1 - y0)


def build_object_masks(
    crops: Sequence[np.ndarray],
    segmenter,
    hint: dict,
    key_step: int = 8,
    expand_px: int = 6,
    stats: Optional[ObjectMaskStats] = None,
) -> np.ndarray:
    """Máscara do objeto para cada frame do chunk.

    Segmenta em keyframes (caro) e transporta por optical flow entre eles
    (barato). A cada keyframe seguinte o prompt é a caixa da máscara propagada,
    de modo que a seleção acompanha o objeto se ele se move.
    """
    count = len(crops)
    if count == 0:
        return np.zeros((0, 1, 1), np.uint8)
    height, width = crops[0].shape[:2]
    out = np.zeros((count, height, width), np.uint8)
    st = stats or ObjectMaskStats()

    keys = list(range(0, count, max(1, key_step)))
    if keys[-1] != count - 1:
        keys.append(count - 1)

    key_masks: List[np.ndarray] = []
    previous: Optional[np.ndarray] = None
    for index, key in enumerate(keys):
        prompt = hint
        if index > 0 and previous is not None:
            # Reancora o prompt no objeto onde ele está agora.
            moved = tracking.propagate(list(crops[max(0, keys[index - 1]):key + 1]), previous, 0)[-1]
            box = _bbox_of(moved)
            prompt = {"boxes": [box], "points": []} if box else hint
        mask = segmenter.segment(crops[key], prompt)
        st.segmentations += 1
        if mask.max() == 0 and previous is not None:
            mask = previous.copy()
        previous = mask
        key_masks.append(mask)

    masks = tracking.interpolate_keyframes(list(crops), keys, key_masks)
    masks = tracking.stabilize(np.asarray(masks), window=5)
    st.propagated = max(0, count - len(keys))
    st.engine = getattr(segmenter, "last_engine", "grabcut")

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1, expand_px) * 2 + 1,) * 2)
    for i in range(count):
        m = np.asarray(masks[i], np.uint8)
        if m.max() > 0:
            m = cv2.dilate(m, kernel)
        out[i] = m

    st.coverage = float(np.count_nonzero(out) / max(1, out.size))
    if stats is not None:
        stats.__dict__.update(st.__dict__)
    return out


def stats_to_metrics(stats: ObjectMaskStats) -> Dict[str, float]:
    return {
        "object_segmentations": float(stats.segmentations),
        "object_propagated": float(stats.propagated),
        "object_coverage": round(float(stats.coverage), 4),
        "object_engine_sam2": 1.0 if stats.engine == "sam2-onnx" else 0.0,
    }
