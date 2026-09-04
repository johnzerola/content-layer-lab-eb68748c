"""Interfaces plugáveis do Clean Engine.

Nada no motor pode ficar preso a um único modelo: cada etapa é uma interface e
os motores atuais são apenas uma implementação dela. Trocar RapidOCR por outro
detector, ou TBE por um modelo de vídeo, é registrar outro provider.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Protocol, Sequence, Tuple

import numpy as np

Box = Tuple[int, int, int, int]


class TextDetector(Protocol):
    name: str

    def available(self) -> bool: ...

    def detect(self, frame: np.ndarray) -> List[Box]: ...


class MaskGenerator(Protocol):
    name: str

    def build(self, frame: np.ndarray, boxes: Sequence[Box]) -> np.ndarray: ...


class TemporalReconstructor(Protocol):
    name: str

    def reconstruct(self, frames: np.ndarray, masks: np.ndarray) -> np.ndarray: ...


class InpaintingProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def process(self, frame: np.ndarray, mask: np.ndarray) -> np.ndarray: ...


class SegmentationProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def segment(self, frame: np.ndarray, hint: dict) -> np.ndarray: ...


class UpscaleProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def upscale(self, image: np.ndarray, factor: float) -> np.ndarray: ...


_REGISTRY: Dict[str, Dict[str, object]] = {
    "text_detector": {},
    "mask_generator": {},
    "temporal": {},
    "inpainting": {},
    "segmentation": {},
    "upscale": {},
}


def register(kind: str, name: str, provider: object) -> None:
    _REGISTRY.setdefault(kind, {})[name] = provider


def get(kind: str, name: str) -> Optional[object]:
    return _REGISTRY.get(kind, {}).get(name)


def catalog() -> Dict[str, List[str]]:
    return {kind: sorted(items) for kind, items in _REGISTRY.items()}
