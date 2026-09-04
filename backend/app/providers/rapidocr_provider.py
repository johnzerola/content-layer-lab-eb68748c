"""Detector de texto padrão: RapidOCR (ONNX Runtime / PP-OCR), CPU-first.

O provider é fino de propósito — a inferência já existe em services.text_detect
e continua sendo usada pela API antiga. Aqui ela ganha a interface plugável.
"""
from __future__ import annotations

from typing import List, Sequence

import cv2
import numpy as np

from ..services import mask as mask_svc
from ..services.text_detect import Box, detect_text_boxes, detector_status, text_pixel_mask
from . import register


class RapidOcrTextDetector:
    name = "rapidocr"

    def available(self) -> bool:
        return bool(detector_status().get("ready"))

    def engine(self) -> str:
        return str(detector_status().get("engine"))

    def detect(self, frame: np.ndarray) -> List[Box]:
        return detect_text_boxes(frame)


class GlyphMaskGenerator:
    """Máscara de texto com fill + stroke + sombra + glow, nunca só o miolo."""

    name = "glyph"

    def __init__(
        self,
        expand_px: int = 4,
        feather_px: int = 3,
        dilate_ratio: float = 0.32,
    ) -> None:
        self.expand_px = max(0, expand_px)
        self.feather_px = max(0, feather_px)
        self.dilate_ratio = dilate_ratio

    def build(self, frame: np.ndarray, boxes: Sequence[Box]) -> np.ndarray:
        height, width = frame.shape[:2]
        out = np.zeros((height, width), np.uint8)
        for box in boxes:
            out = np.maximum(out, text_pixel_mask(frame, box, self.dilate_ratio))
        if out.max() == 0:
            return out
        if self.expand_px:
            k = self.expand_px * 2 + 1
            out = cv2.dilate(out, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        return mask_svc.refine(out, feather=self.feather_px)


register("text_detector", RapidOcrTextDetector.name, RapidOcrTextDetector())
register("mask_generator", GlyphMaskGenerator.name, GlyphMaskGenerator())
