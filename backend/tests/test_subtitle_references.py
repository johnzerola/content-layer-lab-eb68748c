"""Reference detail must be real, locally aligned, and outside donor text masks."""
from pathlib import Path
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.video.subtitle_references import recover_detail


def scene(seed=12):
    rng = np.random.default_rng(seed)
    height, width = 256, 360
    noise = rng.normal(0, 27, (height, width)).astype(np.float32)
    texture = cv2.GaussianBlur(noise, (3, 3), 0.6)
    yy, xx = np.mgrid[:height, :width]
    gray = np.clip(112 + xx * 0.045 + yy * 0.018 + texture, 0, 255).astype(np.uint8)
    clean = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    # Distributed, distinct features on the same textured surface.
    for index in range(24):
        x, y = int(rng.integers(18, width - 18)), int(rng.integers(18, height - 18))
        color = int(rng.integers(55, 185))
        cv2.circle(clean, (x, y), 3 + index % 4, (color,) * 3, 1)
    mask = np.zeros((height, width), np.uint8)
    mask[100:155, 100:255] = 255
    original = clean.copy()
    cv2.putText(original, 'TEXT', (112, 139), cv2.FONT_HERSHEY_SIMPLEX, 1,
                (0, 255, 0), 4, cv2.LINE_AA)
    reconstruction = clean.copy()
    blurred = cv2.GaussianBlur(clean, (0, 0), 2.2)
    reconstruction[mask > 0] = blurred[mask > 0]
    return clean, original, reconstruction, mask


def shifted(image, dx=5, dy=-3):
    return cv2.warpAffine(image, np.float32([[1, 0, dx], [0, 1, dy]]),
                          (image.shape[1], image.shape[0]), flags=cv2.INTER_NEAREST,
                          borderMode=cv2.BORDER_REFLECT)


def test_verified_translated_reference_restores_detail_without_touching_other_pixels():
    clean, original, reconstruction, mask = scene()
    donor = shifted(clean)
    snapshots = [item.copy() for item in (original, reconstruction, mask, donor)]
    output, stats = recover_detail(original, reconstruction, mask,
                                   [(donor, np.zeros_like(mask))])
    assert stats['accepted'] == 1, stats
    assert stats['coverage'] > 0.8
    assert stats['changed_pixels'] > 0
    assert np.array_equal(output[mask == 0], reconstruction[mask == 0])
    # The transferred signal must move toward actual hidden pixels, not merely
    # increase a generic sharpness score.
    before = np.mean((reconstruction[mask > 0].astype(float) - clean[mask > 0]) ** 2)
    after = np.mean((output[mask > 0].astype(float) - clean[mask > 0]) ** 2)
    assert after < before * 0.9
    assert np.max(np.abs(output.astype(int) - reconstruction.astype(int))) <= 4
    for current, snapshot in zip((original, reconstruction, mask, donor), snapshots):
        assert np.array_equal(current, snapshot)


def test_donor_caption_and_safety_margin_are_never_transferred():
    clean, original, reconstruction, mask = scene()
    donor_mask = np.zeros_like(mask)
    donor_mask[101:151, 182:250] = 255
    donor = clean.copy()
    donor[donor_mask > 0] = (0, 255, 0)
    donor = shifted(donor)
    donor_mask = shifted(donor_mask)
    output, stats = recover_detail(original, reconstruction, mask, [(donor, donor_mask)])
    assert stats['accepted'] == 1, stats
    assert 0 < stats['coverage'] < 0.75
    # Includes donor glyphs, their eight-pixel halo and the filter footprint.
    hidden = np.zeros_like(mask)
    hidden[94:159, 175:258] = 255
    assert np.array_equal(output[hidden > 0], reconstruction[hidden > 0])
    assert np.any(output[100:155, 102:160] != reconstruction[100:155, 102:160])


def test_same_occlusion_in_all_references_returns_original_reconstruction():
    _, original, reconstruction, mask = scene()
    output, stats = recover_detail(original, reconstruction, mask, [(original.copy(), mask.copy())])
    assert stats['accepted'] == 0
    assert stats['coverage'] == 0
    assert np.array_equal(output, reconstruction)


def test_unrelated_shot_is_rejected():
    _, original, reconstruction, mask = scene()
    unrelated, _, _, _ = scene(seed=43)
    output, stats = recover_detail(original, reconstruction, mask,
                                   [(unrelated, np.zeros_like(mask))])
    assert stats['accepted'] == 0
    assert stats['rejected'] == 1
    assert np.array_equal(output, reconstruction)


def test_aligned_distant_background_cannot_override_local_appearance_mismatch():
    clean, original, reconstruction, mask = scene()
    donor = clean.copy()
    rng = np.random.default_rng(77)
    # Matching global background, but the actual repair's local neighborhood
    # belongs to a different surface/occluder. RANSAC alone would be inadequate.
    donor[75:182, 70:284] = rng.integers(60, 190, (107, 214, 3), dtype=np.uint8)
    output, stats = recover_detail(original, reconstruction, mask,
                                   [(donor, np.zeros_like(mask))])
    assert stats['accepted'] == 0
    assert stats['rejections'].get('local_appearance_mismatch') == 1, stats
    assert np.array_equal(output, reconstruction)


def test_untextured_background_has_no_evidence_for_detail_transfer():
    clean = np.full((200, 300, 3), 100, np.uint8)
    mask = np.zeros((200, 300), np.uint8)
    mask[90:120, 80:220] = 255
    output, stats = recover_detail(clean, clean.copy(), mask, [(clean.copy(), np.zeros_like(mask))])
    assert stats['fallback'] == 'insufficient_local_texture'
    assert np.array_equal(output, clean)


def test_already_detailed_reconstruction_is_not_sharpened_again():
    clean, original, _, mask = scene()
    output, stats = recover_detail(original, clean.copy(), mask, [(clean.copy(), np.zeros_like(mask))])
    assert stats['accepted'] == 0
    assert stats['rejections'].get('no_missing_detail') == 1, stats
    assert np.array_equal(output, clean)


def test_large_geometric_change_is_rejected_even_when_features_match():
    clean, original, reconstruction, mask = scene()
    matrix = cv2.getRotationMatrix2D((180, 128), 16, 1.0)
    donor = cv2.warpAffine(clean, matrix, (360, 256), borderMode=cv2.BORDER_REFLECT)
    output, stats = recover_detail(original, reconstruction, mask,
                                   [(donor, np.zeros_like(mask))])
    assert stats['accepted'] == 0
    assert np.array_equal(output, reconstruction)


def test_eight_donor_budget_excludes_later_frames():
    clean, original, reconstruction, mask = scene()
    donors = [(original.copy(), mask.copy()) for _ in range(8)]
    donors.append((clean, np.zeros_like(mask)))
    output, stats = recover_detail(original, reconstruction, mask, donors)
    assert stats['considered'] == 8
    assert stats['accepted'] == 0
    assert np.array_equal(output, reconstruction)


def test_repeatability_and_zero_strength():
    clean, original, reconstruction, mask = scene()
    donors = [(shifted(clean), np.zeros_like(mask))]
    first, first_stats = recover_detail(original, reconstruction, mask, donors)
    second, second_stats = recover_detail(original, reconstruction, mask, donors)
    assert np.array_equal(first, second)
    assert first_stats == second_stats
    untouched, stats = recover_detail(original, reconstruction, mask, donors, strength=0)
    assert stats['considered'] == 0
    assert np.array_equal(untouched, reconstruction)


@pytest.mark.parametrize('strength', [-1, 0.6, float('nan'), float('inf')])
def test_invalid_strength_fails_explicitly(strength):
    clean, original, reconstruction, mask = scene()
    with pytest.raises(ValueError, match='strength'):
        recover_detail(original, reconstruction, mask, [(clean, np.zeros_like(mask))], strength=strength)


def test_invalid_donor_is_skipped_and_invalid_target_is_an_error():
    _, original, reconstruction, mask = scene()
    output, stats = recover_detail(original, reconstruction, mask,
                                   [(np.zeros((10, 10, 3), np.uint8), mask)])
    assert stats['rejections']['invalid_donor'] == 1
    assert np.array_equal(output, reconstruction)
    with pytest.raises(ValueError, match='mask'):
        recover_detail(original, reconstruction, mask[:10], [])
