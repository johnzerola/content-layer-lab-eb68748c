"""Reconstrução temporal (TBE) como provider.

Primeira tentativa sempre: preencher o buraco com pixels REAIS do próprio
vídeo, expostos em outros frames da mesma cena. Só o que a linha do tempo
nunca mostrou cai para inpainting.
"""
from __future__ import annotations

import numpy as np

from ..engines.tbe import TemporalBackgroundExposureEngine
from . import register


class TemporalProvider:
    name = "tbe"

    def __init__(self, max_samples: int = 28, feather: int = 3, flow_refine: bool = False) -> None:
        self.max_samples = max_samples
        self.feather = feather
        self.flow_refine = flow_refine
        self._engine = TemporalBackgroundExposureEngine(max_samples, feather, flow_refine)

    def with_window(self, max_samples: int) -> "TemporalProvider":
        """Janela temporal adaptativa (±15 → ±30 → ±60) sem recriar cache à toa."""
        if max_samples == self.max_samples:
            return self
        return TemporalProvider(max_samples, self.feather, self.flow_refine)


    def available(self) -> bool:
        return True

    def reconstruct(self, frames: np.ndarray, masks: np.ndarray) -> np.ndarray:
        if len(frames) == 0:
            return frames
        return self._engine.process(np.asarray(frames), np.asarray(masks))


register("temporal", TemporalProvider.name, TemporalProvider())
