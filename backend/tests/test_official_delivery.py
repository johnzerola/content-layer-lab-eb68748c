"""Real codec and mask checks around the official engines (no GPU required)."""
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
import pytest

from app.services.inference_region import _write_video
from app.utils.video import probe, read_frames
from app.workers.tasks import _run_diffusion_pipeline, _run_official_pipeline


pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg required")


@pytest.fixture
def prepared_clip(tmp_path, monkeypatch):
    monkeypatch.setenv("CLEANER_INFERENCE_ROI_MARGIN", "96")
    source = tmp_path / "source.mp4"
    frames = [np.full((64, 96, 3), (30, 170, 50 + index * 20), np.uint8) for index in range(3)]
    _write_video(source, 96, 64, 29.97, frames)
    directory = tmp_path / "reviewed"
    directory.mkdir()
    masks = []
    for index in range(3):
        mask = np.zeros((64, 96), np.uint8)
        if index != 1:
            mask[32:40, 40:48] = 255
        assert cv2.imwrite(str(directory / f"{index:06d}.png"), mask)
        masks.append(mask)
    return source, directory, masks, probe(str(source))


def _run(engine, source, destination, directory, masks, info, **options):
    arguments = [str(source), str(destination), str(directory), [], info, "karaoke"]
    if engine == "propainter":
        arguments.append("quality")
    arguments.extend([True, 1, False, options.pop("verify_on", False), lambda *_: None])
    pipeline = _run_official_pipeline if engine == "propainter" else _run_diffusion_pipeline
    return pipeline(*arguments, prepared_mask_dir=str(masks), **options)


def test_alternative_uses_the_same_reviewed_masks_and_keeps_empty_frames(tmp_path, prepared_clip):
    source, masks, expected_masks, info = prepared_clip
    audit_directories = []
    observed_masks = []

    def audit(_video, mask_dir, _fps):
        audit_directories.append(Path(mask_dir).resolve())
        return [], {"residual_text": 0, "sharpness_ratio": 0.1 if len(audit_directories) == 1 else 1,
                    "temporal_consistency": 1}

    def diffusion(input_video, mask_video, *_args):
        observed_masks.extend(read_frames(mask_video))
        return input_video

    with patch("app.workers.tasks._write_mask_sequence", side_effect=AssertionError("masks must not be regenerated")), \
         patch("app.workers.tasks.run_propainter", side_effect=lambda input_video, *_: input_video), \
         patch("app.workers.tasks.run_diffueraser", side_effect=diffusion), \
         patch("app.workers.tasks.diffueraser_status", return_value=SimpleNamespace(ready=True)), \
         patch("app.workers.tasks._audit_video", side_effect=audit):
        _, metrics, frames = _run("propainter", source, tmp_path / "output.mp4", tmp_path,
                                  masks, info, verify_on=True, refinement_budget=[1])

    assert metrics["selected_engine"] == "diffueraser-official"
    assert frames == info.frames and source.exists()
    assert audit_directories == [masks.resolve(), masks.resolve()]
    assert len(observed_masks) == len(expected_masks)
    for expected, actual in zip(expected_masks, observed_masks):
        assert np.array_equal(actual[:, :, 0] > 127, expected > 127)


@pytest.mark.parametrize("engine", ["propainter", "diffueraser"])
def test_disabling_composite_still_delivers_h264_yuv420_with_native_timing(tmp_path, prepared_clip, engine):
    source, masks, _, info = prepared_clip
    output = tmp_path / "output.mp4"
    with patch(f"app.workers.tasks.run_{engine}", side_effect=lambda input_video, *_: input_video):
        _run(engine, source, output, tmp_path, masks, info, composite_on=False)
    metadata = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=codec_name,pix_fmt", "-of", "json", str(output),
    ], check=True, capture_output=True, text=True).stdout)["streams"][0]
    assert metadata == {"codec_name": "h264", "pix_fmt": "yuv420p"}
    actual = probe(str(output))
    assert (actual.width, actual.height, actual.frames) == (info.width, info.height, info.frames)
    assert actual.fps == pytest.approx(info.fps, abs=1e-5)
    assert len(list(read_frames(str(output)))) == info.frames


@pytest.mark.parametrize("engine", ["propainter", "diffueraser"])
def test_reviewed_masks_cannot_silently_cross_a_scene_cut(tmp_path, prepared_clip, engine):
    source, masks, _, info = prepared_clip
    with pytest.raises(ValueError, match="separadamente por cena"):
        _run(engine, source, tmp_path / "output.mp4", tmp_path, masks, info, scene_cuts=[1])
