import unittest
from unittest.mock import patch

import cv2
import numpy as np
import pytest

from app.services import text_detect
from app.services.text_detect import _bright_subtitle_mask, frame_text_mask, text_pixel_mask


@pytest.mark.parametrize("color", [(20, 145, 55), (52, 72, 55)])
def test_colored_and_faded_subtitle_survives_empty_ocr(color):
    frame = np.full((300, 600, 3), 50, np.uint8)
    roi = np.zeros(frame.shape[:2], np.uint8)
    roi[190:280, 40:560] = 255
    glyphs = np.zeros_like(roi)
    cv2.putText(glyphs, "WORD", (150, 255), cv2.FONT_HERSHEY_SIMPLEX, 2, 255, 5)
    frame[glyphs > 0] = color
    with patch("app.services.text_detect.detect_text_boxes", return_value=[]):
        result = frame_text_mask(frame, roi, subtitle_only=True)
    assert (result[glyphs > 0] > 0).mean() > .95
    assert not result[roi == 0].any()


def test_empty_ocr_does_not_erase_uniform_colored_background_or_blank_frame():
    roi = np.zeros((300, 600), np.uint8)
    roi[190:280, 40:560] = 255
    for color in [(20, 145, 55), (50, 50, 50)]:
        frame = np.full((300, 600, 3), color, np.uint8)
        with patch("app.services.text_detect.detect_text_boxes", return_value=[]):
            assert not frame_text_mask(frame, roi, subtitle_only=True).any()


def test_partial_ocr_still_masks_short_saturated_word():
    frame = np.full((300, 600, 3), 50, np.uint8)
    roi = np.zeros(frame.shape[:2], np.uint8)
    roi[190:280, 40:560] = 255
    glyphs = np.zeros_like(roi)
    cv2.putText(glyphs, "E", (200, 255), cv2.FONT_HERSHEY_SIMPLEX, 2, 255, 5)
    frame[glyphs > 0] = (20, 145, 55)
    # A spurious OCR box elsewhere must not disable the color supplement.
    def partial_mask(search, _box):
        found = np.zeros(search.shape[:2], np.uint8)
        found[50:55, 80:85] = 255
        return found
    with patch("app.services.text_detect.detect_text_boxes", return_value=[(80, 50, 5, 5)]), \
         patch("app.services.text_detect.text_pixel_mask", side_effect=partial_mask):
        result = frame_text_mask(frame, roi, subtitle_only=True)
    assert result[218, 98] == 255
    assert (result[glyphs > 0] > 0).mean() > .95


class FrameTextMaskTests(unittest.TestCase):
    def test_large_headline_dilation_preserves_narrow_word_gap(self):
        cv2 = __import__("cv2")
        frame = np.zeros((160, 250, 3), dtype=np.uint8)
        cv2.rectangle(frame, (20, 30), (70, 120), (255, 255, 255), -1)
        cv2.rectangle(frame, (100, 30), (150, 120), (255, 255, 255), -1)
        result = text_pixel_mask(frame, (10, 20, 150, 110))
        self.assertEqual(result[70, 85], 0)
        self.assertGreater(result[70, 50], 0)

    def test_glyph_mask_does_not_fill_the_complete_subtitle_band(self):
        cv2 = __import__("cv2")
        frame = np.zeros((100, 240, 3), dtype=np.uint8)
        cv2.rectangle(frame, (20, 35), (45, 65), (255, 255, 255), -1)
        cv2.rectangle(frame, (190, 35), (215, 65), (255, 255, 255), -1)

        result = text_pixel_mask(frame, (10, 25, 220, 50), dilate_ratio=0.12)

        self.assertGreater(result[50, 30], 0)
        self.assertGreater(result[50, 200], 0)
        self.assertEqual(result[50, 120], 0)
        self.assertLess(float((result > 0).mean()), 0.25)

    def test_bright_subtitle_mask_keeps_short_words_on_the_same_line(self):
        frame = np.zeros((180, 320, 3), dtype=np.uint8)
        roi = np.zeros((180, 320), dtype=np.uint8)
        roi[100:160] = 255
        cv2 = __import__("cv2")
        for x in (60, 78, 150, 168, 186):
            cv2.rectangle(frame, (x, 120), (x + 8, 142), (255, 255, 255), -1)

        result = _bright_subtitle_mask(frame, roi)

        self.assertGreater(result[130, 64], 0)
        self.assertGreater(result[130, 154], 0)
        self.assertFalse(np.any(result[:90]))

    def test_morphology_can_be_selected_without_loading_paddle(self):
        with patch.dict("os.environ", {"CLEANER_TEXT_DETECTOR": "morphology"}), \
             patch.object(text_detect, "_detector_tried", False), \
             patch.object(text_detect, "_detector_kind", "uninitialized"), \
             patch.object(text_detect, "_detector", None):
            self.assertIsNone(text_detect._get_detector())
            self.assertEqual(text_detect._detector_kind, "morphology")

    def test_detector_is_limited_to_the_requested_roi(self):
        frame = np.full((300, 200, 3), 80, dtype=np.uint8)
        roi = np.zeros((300, 200), dtype=np.uint8)
        roi[210:250, 40:160] = 255

        with patch("app.services.text_detect.detect_text_boxes", return_value=[]) as detect:
            result = frame_text_mask(frame, roi=roi, subtitle_only=True)

        detector_frame = detect.call_args.args[0]
        self.assertLess(detector_frame.shape[0], frame.shape[0])
        self.assertLess(detector_frame.shape[1], frame.shape[1])
        self.assertEqual(result.shape, roi.shape)

    def test_failed_paddle_inference_is_disabled_for_following_frames(self):
        class BrokenDetector:
            def ocr(self, *_args, **_kwargs):
                raise RuntimeError("unsupported runtime")

        frame = np.zeros((40, 80, 3), dtype=np.uint8)
        with patch.object(text_detect, "_get_detector", return_value=BrokenDetector()), \
             patch.object(text_detect, "_detector_kind", "paddleocr-legacy"), \
             patch.object(text_detect, "_detector", BrokenDetector()):
            self.assertEqual(text_detect._boxes_paddle(frame), [])
            self.assertIsNone(text_detect._detector)
            self.assertEqual(text_detect._detector_kind, "morphology")


if __name__ == "__main__":
    unittest.main()
