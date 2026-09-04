import unittest
from unittest.mock import patch

import numpy as np

from app.engines.inpainting import TemporalFillEngine, patch_fill


class TemporalFillEngineTests(unittest.TestCase):
    def test_spatial_fallback_only_changes_the_hole(self):
        image = np.full((80, 120, 3), 90, dtype=np.uint8)
        image[:, 60:] = 180
        hole = np.zeros((80, 120), dtype=np.uint8)
        hole[30:45, 52:68] = 255

        output = patch_fill(image, hole)

        np.testing.assert_array_equal(output[hole == 0], image[hole == 0])

    def test_empty_mask_returns_an_unchanged_copy(self):
        frames = np.full((2, 120, 160, 3), 80, dtype=np.uint8)
        masks = np.zeros((2, 120, 160), dtype=np.uint8)

        output = TemporalFillEngine().process(frames, masks)

        np.testing.assert_array_equal(output, frames)
        self.assertIsNot(output, frames)

    def test_optical_flow_is_limited_to_the_mask_region(self):
        frames = np.full((2, 200, 300, 3), 120, dtype=np.uint8)
        masks = np.zeros((2, 200, 300), dtype=np.uint8)
        masks[0, 145:160, 90:210] = 255

        seen_shapes = []

        def fake_flow(current, neighbor, *_args):
            seen_shapes.append(current.shape)
            return np.zeros((*current.shape, 2), dtype=np.float32)

        with patch("app.engines.inpainting.cv2.calcOpticalFlowFarneback", side_effect=fake_flow):
            output = TemporalFillEngine(context_radius=1).process(frames, masks)

        self.assertTrue(seen_shapes)
        self.assertLess(seen_shapes[0][0], frames.shape[1])
        self.assertLess(seen_shapes[0][1], frames.shape[2])
        np.testing.assert_array_equal(output[:, :100], frames[:, :100])

    def test_temporal_neighbors_are_bounded(self):
        frames = np.full((9, 100, 160, 3), 120, dtype=np.uint8)
        masks = np.zeros((9, 100, 160), dtype=np.uint8)
        masks[:, 60:72, 50:110] = 255
        masks[0, 60:72, 50:110] = 0
        calls = []

        def fake_flow(current, neighbor, *_args):
            calls.append((current.shape, neighbor.shape))
            return np.zeros((*current.shape, 2), dtype=np.float32)

        engine = TemporalFillEngine(context_radius=8, max_neighbors=2)
        with patch("app.engines.inpainting.cv2.calcOpticalFlowFarneback", side_effect=fake_flow):
            engine.process(frames, masks)

        self.assertLessEqual(len(calls), (len(frames) - 1) * 2)

    def test_only_requested_target_frames_are_reconstructed(self):
        frames = np.full((5, 80, 120, 3), 100, dtype=np.uint8)
        masks = np.zeros((5, 80, 120), dtype=np.uint8)
        masks[:, 45:55, 45:75] = 255
        masks[0] = 0

        with patch("app.engines.inpainting.patch_fill") as fill:
            fill.side_effect = lambda image, _hole: image
            TemporalFillEngine(context_radius=2).process(
                frames, masks, target_start=2, target_end=4
            )

        self.assertLessEqual(fill.call_count, 2)


if __name__ == "__main__":
    unittest.main()
