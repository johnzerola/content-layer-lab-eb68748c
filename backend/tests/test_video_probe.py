"""Video geometry/timing must not be inferred from the longest audio track."""
import json
import shutil
import subprocess

import cv2
import numpy as np
import pytest

from app.services.inference_region import _write_video, prepare_inference_region
from app.utils.video import probe, read_frames


pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg required")


@pytest.mark.parametrize("container", ["mkv", "mp4"])
def test_longer_audio_does_not_inflate_video_duration_or_mask_count(tmp_path, container):
    silent = tmp_path / "silent.mp4"
    _write_video(silent, 96, 64, 30, [np.full((64, 96, 3), 80, np.uint8)] * 6)
    source = tmp_path / f"source.{container}"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", str(silent), "-f", "lavfi", "-i",
        "anullsrc=r=48000:cl=stereo", "-t", "0.6", "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", str(source),
    ], check=True, capture_output=True)
    raw = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source),
    ], check=True, capture_output=True, text=True).stdout)
    assert float(raw["format"]["duration"]) >= 0.6
    if container == "mkv":
        assert not raw["streams"][0].get("nb_frames")

    info = probe(str(source))
    assert info.frames == len(list(read_frames(str(source)))) == 6
    assert info.duration == pytest.approx(0.2, abs=0.001)
    assert info.has_audio
    masks = tmp_path / "masks"
    masks.mkdir()
    for index in range(6):
        mask = np.zeros((64, 96), np.uint8)
        mask[30:36, 45:52] = 255
        assert cv2.imwrite(str(masks / f"{index:06d}.png"), mask)
    region = prepare_inference_region(str(source), str(masks), str(tmp_path), info, margin=8)
    assert region.active and region.cropped
    assert probe(region.source_path).frames == 6
