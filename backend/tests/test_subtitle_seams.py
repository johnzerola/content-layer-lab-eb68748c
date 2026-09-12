import cv2
import numpy as np

from app.video.subtitle_seams import correct_seam


def test_boundary_colour_error_reduces_without_using_text_inside_mask():
    original = np.full((96, 144, 3), 100, np.uint8)
    mask = np.zeros((96, 144), np.uint8)
    mask[30:65, 30:115] = 255
    original[mask > 0] = (0, 250, 0)
    native = np.full_like(original, 108)
    baseline = original.copy()
    baseline[mask > 0] = native[mask > 0]
    result, stats = correct_seam(original, native, baseline, mask, mask)
    assert stats['changed_pixels'] > 100
    edge = (mask > 0) & (cv2.erode(mask, np.ones((3, 3), np.uint8)) == 0)
    assert np.mean(np.abs(result[edge].astype(float) - 100)) < 5
    # The green text has no effect on the result's chroma or exterior.
    assert np.array_equal(result[..., 0][mask > 0], result[..., 1][mask > 0])
    np.testing.assert_array_equal(result[mask == 0], baseline[mask == 0])
    assert stats['max_delta'] <= 10


def test_unsafe_exterior_or_large_structural_difference_is_rejected():
    a = np.full((96, 144, 3), 100, np.uint8)
    m = np.zeros((96, 144), np.uint8)
    m[30:65, 30:115] = 255
    for b, excluded in ((a + 60, m), (a + 8, np.full_like(m, 255))):
        output, stats = correct_seam(a, b, a, m, excluded)
        np.testing.assert_array_equal(output, a)
        assert not stats['changed_pixels']
