"""Pixel safety and evidence requirements for deterministic subtitle finishing."""
import cv2
import numpy as np
import pytest

from app.video.subtitle_finish import FinishState, finish_frame


def sample(value=100):
    original = np.full((96, 128, 3), value, dtype=np.uint8)
    mask = np.zeros((96, 128), dtype=np.uint8)
    mask[32:64, 24:104] = 255
    return original, mask


def test_preserves_outside_and_protected_holes_exactly():
    original, mask = sample()
    mask[43:53, 54:66] = 0
    reconstructed = np.full_like(original, 95)
    finished, report = finish_frame(original, reconstructed, mask, FinishState())
    assert np.array_equal(finished[mask == 0], original[mask == 0])
    assert report["applied"]
    assert report["mode"] == "paired_exterior"


def test_never_reintroduces_original_subtitle_into_reconstructed_core():
    original, mask = sample()
    clean = np.full_like(original, 95)
    with_text = original.copy()
    cv2.putText(with_text, "TEXT", (29, 57), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    without_text, _ = finish_frame(original, clean, mask, FinishState())
    result, _ = finish_frame(with_text, clean, mask, FinishState())
    assert np.array_equal(result, without_text)
    assert int(result[mask > 0].max()) <= 98


def test_composited_exterior_can_correct_only_reliable_local_boundary():
    original, mask = sample()
    rebuilt = original.copy()
    rebuilt[mask > 0] = 96
    result, report = finish_frame(original, rebuilt, mask, FinishState())
    assert report["mode"] == "local_boundary"
    assert report["applied"]
    assert np.array_equal(result[40:56, 40:88], rebuilt[40:56, 40:88])
    assert np.array_equal(result[mask == 0], original[mask == 0])
    assert result[32, 50, 0] > rebuilt[32, 50, 0]


def test_distinct_object_does_not_inherit_background_mean_or_sharpening():
    original, mask = sample(180)
    rebuilt = original.copy()
    rebuilt[mask > 0] = 60
    result, report = finish_frame(original, rebuilt, mask, FinishState())
    assert np.array_equal(result, rebuilt)
    assert not report["applied"]
    assert report["reason"] == "insufficient_evidence"


def test_empty_mask_resets_state_and_returns_original():
    original, mask = sample()
    rebuilt = np.full_like(original, 95)
    state = FinishState()
    finish_frame(original, rebuilt, mask, state)
    result, report = finish_frame(original, rebuilt, np.zeros_like(mask), state)
    assert np.array_equal(result, original)
    assert report["reason"] == "empty_mask"
    _, after = finish_frame(original, rebuilt, mask, state)
    assert not after["smoothed"]


def test_parameters_smooth_but_no_previous_frame_pixels_are_copied():
    original, mask = sample()
    state = FinishState()
    _, first = finish_frame(original, np.full_like(original, 94), mask, state)
    rebuilt = np.full_like(original, 96)
    rebuilt[45:50, 60:70] = (30, 70, 120)
    result, second = finish_frame(original, rebuilt, mask, state)
    assert second["smoothed"]
    assert 1.2 < second["colour_shift_bgr"][0] < first["colour_shift_bgr"][0]
    assert np.max(np.abs(result[45:50, 60:70].astype(int) - rebuilt[45:50, 60:70].astype(int))) <= 3
    state.reset()
    _, fresh = finish_frame(original, rebuilt, mask, state)
    assert not fresh["smoothed"]
    assert fresh["colour_shift_bgr"][0] == pytest.approx(1.2)


def test_unreliable_frame_does_not_reuse_previous_correction():
    original, mask = sample()
    state = FinishState()
    finish_frame(original, np.full_like(original, 94), mask, state)
    rebuilt = original.copy()
    rebuilt[mask > 0] = 20
    result, report = finish_frame(original, rebuilt, mask, state)
    assert not report["applied"]
    assert np.array_equal(result, rebuilt)
    _, next_report = finish_frame(original, np.full_like(original, 94), mask, state)
    assert not next_report["smoothed"]


def test_reversed_evidence_discards_old_parameter():
    original, mask = sample()
    state = FinishState()
    finish_frame(original, np.full_like(original, 94), mask, state)
    _, report = finish_frame(original, np.full_like(original, 104), mask, state)
    assert report["colour_shift_bgr"][0] == pytest.approx(-1.2)
    assert not report["smoothed"]


def test_deterministic_bounded_and_does_not_mutate_inputs():
    original, mask = sample(245)
    reconstructed = np.full_like(original, 233)
    snapshots = [item.copy() for item in (original, reconstructed, mask)]
    first, report = finish_frame(original, reconstructed, mask, FinishState(), strength=1)
    second, other = finish_frame(original, reconstructed, mask, FinishState(), strength=1)
    assert np.array_equal(first, second)
    assert report == other
    assert np.max(np.abs(first[mask > 0].astype(int) - reconstructed[mask > 0].astype(int))) <= 3
    for source, before in zip((original, reconstructed, mask), snapshots):
        assert np.array_equal(source, before)


def test_no_exterior_evidence_leaves_full_mask_unchanged():
    original, mask = sample()
    mask[:] = 255
    rebuilt = np.full_like(original, 90)
    result, report = finish_frame(original, rebuilt, mask, FinishState())
    assert np.array_equal(result, rebuilt)
    assert not report["applied"]


def test_sharpening_requires_correlated_same_pixel_deficit():
    ys, xs = np.indices((96, 128))
    pattern = np.rint(100 + 18 * np.sin(xs * 0.7) + 12 * np.cos(ys * 0.6)).astype(np.uint8)
    original = np.repeat(pattern[..., None], 3, axis=2)
    _, mask = sample()
    reconstructed = cv2.GaussianBlur(original, (3, 3), 0.7)
    result, report = finish_frame(original, reconstructed, mask, FinishState(), strength=1)
    assert report["sharpen_amount"] > 0
    assert report["applied"]
    assert np.array_equal(result[mask == 0], original[mask == 0])
    assert np.max(np.abs(result[mask > 0].astype(int) - reconstructed[mask > 0].astype(int))) <= 3
    # Different spatial structure cannot justify a sharpening parameter.
    unrelated = np.roll(reconstructed, 4, axis=1)
    _, other = finish_frame(original, unrelated, mask, FinishState())
    assert other["sharpen_amount"] == 0
    # A later color-only correction must not carry over old sharpening.
    state = FinishState()
    finish_frame(original, reconstructed, mask, state, strength=1)
    color_only = np.clip(original.astype(int) - 3, 0, 255).astype(np.uint8)
    _, after = finish_frame(original, color_only, mask, state, strength=1)
    assert after["mode"] == "paired_exterior"
    assert after["sharpen_amount"] == 0


def test_disabled_finish_keeps_reconstruction_and_protection():
    original, mask = sample()
    reconstructed = np.full_like(original, 90)
    result, report = finish_frame(original, reconstructed, mask, FinishState(), strength=0)
    assert np.array_equal(result[mask > 0], reconstructed[mask > 0])
    assert np.array_equal(result[mask == 0], original[mask == 0])
    assert report["reason"] == "disabled"


@pytest.mark.parametrize("invalid", [float("nan"), float("inf")])
def test_nonfinite_strength_rejected(invalid):
    original, mask = sample()
    with pytest.raises(ValueError):
        finish_frame(original, original, mask, FinishState(), strength=invalid)
