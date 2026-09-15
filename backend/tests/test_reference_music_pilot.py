"""Signal controls validate engineering, not perceptual speech quality."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest

spec = importlib.util.spec_from_file_location("reference_music_pilot", Path(__file__).parents[1] / "scripts/reference_music_pilot.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_known_delayed_reference_recovers_independent_foreground():
    rng = np.random.default_rng(55)
    rate, length, offset = 48000, 48000 * 6, 12347
    reference = rng.normal(0, 0.08, (length + offset + 5000, 2))
    foreground = rng.normal(0, 0.01, (length, 2))
    music = reference[offset:offset + length] * np.array([0.6, 0.4])
    dialogue, recovered, report = module.separate_reference(foreground + music, reference, rate)
    assert report["lag_samples"] == -offset
    assert np.sqrt(np.mean((dialogue - foreground) ** 2)) < 0.0001
    np.testing.assert_allclose(dialogue + recovered, foreground + music, atol=1e-12)


def test_wrong_song_is_rejected():
    rng = np.random.default_rng(88)
    with pytest.raises(ValueError, match="unreliable|covers"):
        module.separate_reference(rng.normal(size=(48000 * 6, 2)), rng.normal(size=(48000 * 6, 2)), 48000)


def test_nonfinite_input_is_rejected():
    with pytest.raises(ValueError, match="finite"):
        module.separate_reference(np.full((192000, 1), np.nan), np.ones((192000, 1)), 48000)
