import cv2
import numpy as np
import pytest

from app.video.subtitle_junctions import Donor, exclusion_mask, refine_junctions
from tests.test_subtitle_references import scene, shifted


def donors(clean):
    return [Donor(shifted(clean, dx, dy), shifted(clean, dx, dy), np.zeros(clean.shape[:2], np.uint8))
            for dx, dy in ((3, -2), (-2, 2))]


def test_two_visible_translated_donors_reduce_known_background_error():
    clean, original, rebuilt, mask = scene()
    core = exclusion_mask(original, mask, np.full_like(mask, 255))
    before = np.mean((rebuilt[mask > 0].astype(float) - clean[mask > 0])**2)
    _, result, report = refine_junctions(original, rebuilt, mask, core, np.full_like(mask, 255), donors(clean))
    after = np.mean((result[mask > 0].astype(float) - clean[mask > 0])**2)
    assert report['consensus_pixels'] > 100, report
    assert after < before * .8, (before, after, report)
    np.testing.assert_array_equal(result[mask == 0], original[mask == 0])


def test_occluded_donors_do_not_copy_letters_or_halo():
    clean, original, rebuilt, mask = scene()
    blocked = np.full_like(mask, 255)
    ds = [Donor(original.copy(), clean.copy(), blocked.copy()) for _ in range(2)]
    _, result, report = refine_junctions(original, rebuilt, mask, mask, blocked, ds)
    np.testing.assert_array_equal(result[mask > 0], rebuilt[mask > 0])
    assert report['consensus_pixels'] == 0


def test_unrelated_scene_or_single_donor_cannot_supply_texture():
    clean, original, rebuilt, mask = scene()
    other, _, _, _ = scene(seed=50)
    for ds in (donors(other), donors(clean)[:1]):
        _, result, report = refine_junctions(original, rebuilt, mask, mask, np.full_like(mask, 255), ds)
        np.testing.assert_array_equal(result[mask > 0], rebuilt[mask > 0])


def test_protected_hole_is_preserved_even_with_valid_donors():
    clean, original, rebuilt, mask = scene()
    allowed = np.full_like(mask, 255)
    allowed[118:133, 152:169] = 0
    snapshots = [a.copy() for a in (original, rebuilt, mask, allowed)]
    a, b, _ = refine_junctions(original, rebuilt, mask, mask, allowed, donors(clean))
    for image in (a, b):
        np.testing.assert_array_equal(image[allowed == 0], original[allowed == 0])
    for a, b in zip((original, rebuilt, mask, allowed), snapshots):
        np.testing.assert_array_equal(a, b)


def test_verified_mask_transition_does_not_blend_original_text_through_core():
    clean, original, rebuilt, mask = scene()
    composite = cv2.dilate(mask, np.ones((21, 21), np.uint8))
    rebuilt = cv2.GaussianBlur(clean, (0, 0), 2)
    masks_only, _, report = refine_junctions(original, rebuilt, composite, mask,
                                            np.full_like(mask, 255), donors(clean))
    np.testing.assert_array_equal(masks_only[mask > 0], rebuilt[mask > 0])
    assert report['original_pixels_recovered'] > 0


def test_connected_neon_grows_exclusion_but_never_crosses_protection():
    frame = np.zeros((100, 140, 3), np.uint8)
    seed = np.zeros((100, 140), np.uint8)
    seed[40:60, 40:65] = 255
    frame[40:60, 40:65] = (0, 240, 0)
    frame[40:60, 65:74] = (20, 100, 20)
    frame[40:60, 95:110] = (0, 240, 0)  # Unconnected background.
    allowed = np.full_like(seed, 255)
    allowed[:, 72:76] = 0
    out = exclusion_mask(frame, seed, allowed)
    assert out[50, 70] == 255
    assert not out[:, 72:76].any()
    assert out[50, 100] == 0


def test_large_or_invalid_input_fails_before_flow():
    with pytest.raises(ValueError):
        refine_junctions(np.zeros((12, 12, 3), np.uint8), np.zeros((12, 12, 3), np.uint8),
                         *[np.zeros((12, 12), np.uint8)] * 3, [])
