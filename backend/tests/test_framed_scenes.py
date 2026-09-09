from unittest.mock import patch
import numpy as np
from app.services.scene import detect_scenes


class Capture:
    def __init__(self, frames):
        self.frames = iter(frames)
    def read(self):
        frame = next(self.frames, None)
        return frame is not None, frame
    def release(self):
        pass


def test_static_outer_canvas_does_not_hide_the_video_cut():
    a = np.zeros((600, 360, 3), np.uint8)
    b = a.copy()
    a[200:400, 20:340] = (0, 0, 200)
    b[200:400, 20:340] = (200, 0, 0)
    with patch("app.services.scene.cv2.VideoCapture", return_value=Capture([a] * 12 + [b] * 12)):
        assert detect_scenes("fixture") == [(0, 12), (12, 24)]


def test_isolated_small_colored_overlay_is_not_a_scene_cut():
    a = np.zeros((600, 360, 3), np.uint8)
    b = a.copy()
    b[220:240, 30:70] = (0, 255, 0)
    with patch("app.services.scene.cv2.VideoCapture", return_value=Capture([a] * 12 + [b] * 12)):
        assert detect_scenes("fixture") == [(0, 24)]
