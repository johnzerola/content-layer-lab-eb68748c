"""Pós-passe de harmonização: grão/nitidez/cor da área reconstruída."""
import numpy as np
import cv2

from app.video.harmonize import harmonize_frame, harmonize_sequence


def _scene(seed: int = 7):
    rng = np.random.default_rng(seed)
    base = cv2.GaussianBlur(rng.integers(40, 200, (480, 270, 3)).astype(np.uint8), (0, 0), 9)
    base = np.clip(base.astype(np.float32) + rng.normal(0, 7, base.shape), 0, 255).astype(np.uint8)
    mask = np.zeros(base.shape[:2], np.uint8)
    mask[300:360, 30:240] = 255
    filled = base.copy()
    smooth = cv2.GaussianBlur(base, (0, 0), 4).astype(np.float32) + 6
    filled[mask > 0] = np.clip(smooth, 0, 255).astype(np.uint8)[mask > 0]
    return base, filled, mask


def _grain(img, mask):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    return float((g - cv2.GaussianBlur(g, (0, 0), 1.1))[mask > 0].std())


def test_grain_aproxima_o_fundo():
    base, filled, mask = _scene()
    out = harmonize_frame(filled, mask)
    assert _grain(out, mask) > _grain(filled, mask) * 2
    assert _grain(out, mask) < _grain(base, mask) * 1.5


def test_nao_toca_fora_da_mascara():
    base, filled, mask = _scene()
    out = harmonize_frame(filled, mask)
    outside = cv2.dilate(mask, np.ones((15, 15), np.uint8)) == 0
    assert np.array_equal(out[outside], filled[outside])


def test_mascara_vazia_e_noop():
    base, filled, mask = _scene()
    empty = np.zeros_like(mask)
    assert np.array_equal(harmonize_frame(filled, empty), filled)
    frames, stats = harmonize_sequence([filled] * 3, [empty] * 3)
    assert stats.applied == 0 and len(frames) == 3
