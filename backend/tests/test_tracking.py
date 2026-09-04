import unittest
from unittest.mock import patch

import numpy as np

from app.services.tracking import interpolate_keyframes


class TrackingTests(unittest.TestCase):
    def test_keyframe_flow_is_limited_to_active_mask_region(self):
        frames = [np.full((300, 200, 3), 80, dtype=np.uint8) for _ in range(3)]
        masks = []
        for _ in range(2):
            mask = np.zeros((300, 200), dtype=np.uint8)
            mask[220:240, 50:150] = 255
            masks.append(mask)
        seen = []

        def fake_flow(current, neighbor, *_args):
            seen.append(current.shape)
            return np.zeros((*current.shape, 2), dtype=np.float32)

        with patch("app.services.tracking.cv2.calcOpticalFlowFarneback", side_effect=fake_flow):
            result = interpolate_keyframes(frames, [0, 2], masks)

        self.assertTrue(seen)
        self.assertLess(seen[0][0], frames[0].shape[0])
        self.assertLess(seen[0][1], frames[0].shape[1])
        self.assertEqual(len(result), len(frames))
        self.assertFalse(np.any(result[1][:150]))


if __name__ == "__main__":
    unittest.main()
