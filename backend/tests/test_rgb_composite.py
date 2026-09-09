import shutil
import cv2
import numpy as np
import pytest
from app.services.inference_region import _write_video
from app.utils.video import composite_masked, read_frames


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")
def test_opaque_mask_replaces_color_and_keeps_protected_hole():
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        original = np.zeros((96, 128, 3), np.uint8)
        original[:, :] = (10, 240, 10)
        clean = np.zeros_like(original)
        clean[:, :] = (70, 70, 70)
        mask = np.zeros(original.shape[:2], np.uint8)
        mask[16:80, 16:112] = 255
        mask[32:64, 48:80] = 0
        masks = root / "masks"
        masks.mkdir()
        for index in range(2):
            cv2.imwrite(str(masks / f"{index:06d}.png"), mask)
        _write_video(root / "source.mp4", 128, 96, 30, [original] * 2)
        _write_video(root / "clean.mp4", 128, 96, 30, [clean] * 2)
        composite_masked(str(root / "source.mp4"), str(root / "clean.mp4"), str(masks), 30, str(root / "out.mp4"))
        frame = next(read_frames(str(root / "out.mp4")))
        assert np.max(np.abs(frame[22:28, 22:28].astype(float) - 70)) < 6
        assert frame[40:56, 56:72, 1].mean() > 230
        assert frame[2:8, 2:8, 1].mean() > 230
