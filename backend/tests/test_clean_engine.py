"""Testes rápidos do Clean Engine (sem GPU, sem rede)."""
from __future__ import annotations

import numpy as np
import pytest

from app.quality.scoring import quality_score
from app.video.roi import Roi
from app.providers.registry import available_providers


def _frame(color: int = 120) -> np.ndarray:
    img = np.full((256, 256, 3), color, np.uint8)
    img[:, ::8] = 200  # textura
    return img


def test_score_perfeito_sem_mascara() -> None:
    frames = [_frame() for _ in range(6)]
    masks = np.zeros((6, 256, 256), np.uint8)
    report = quality_score(frames, masks)
    assert report.score == 100.0
    assert report.route == "done"


def test_score_penaliza_texto_residual() -> None:
    frames = []
    masks = np.zeros((6, 256, 256), np.uint8)
    masks[:, 100:140, 60:200] = 255
    for _ in range(6):
        f = _frame()
        f[110:130, 70:190] = 255  # "texto" que sobrou
        frames.append(f)
    report = quality_score(frames, masks)
    assert report.score < 90.0
    assert report.route in {"retry", "gpu"}


def test_roi_crop_e_paste_preservam_fora_da_area() -> None:
    roi = Roi(0.1, 0.6, 0.8, 0.2)
    frame = _frame()
    crop = roi.crop(frame)
    assert crop.shape[0] > 0 and crop.shape[1] > 0
    merged = roi.paste(frame.copy(), np.zeros_like(crop), feather=0)
    assert np.array_equal(merged[:10], frame[:10])


def test_registry_expoe_temporal() -> None:
    names = available_providers()
    assert "temporal" in names


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
