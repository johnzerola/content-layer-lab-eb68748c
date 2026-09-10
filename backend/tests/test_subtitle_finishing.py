"""Real-media preservation and failure checks, without model/GPU calls."""
from dataclasses import replace
from pathlib import Path
import shutil

import cv2
import numpy as np
import pytest

from app.services.inference_region import _write_video
from app.services.subtitle_finishing import finish_subtitle_video
from app.utils.video import probe, read_frames


pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")


def media(tmp_path, count=4):
    original, reconstructed = tmp_path / "original.mp4", tmp_path / "model.mp4"
    masks = tmp_path / "masks"
    masks.mkdir()
    rng = np.random.default_rng(91)
    frames, generated = [], []
    for index in range(count):
        frame = rng.integers(60, 140, (96, 160, 3), dtype=np.uint8)
        mask = np.zeros((96, 160), np.uint8)
        if index != 1:
            mask[40:55, 55:100] = 255
            mask[43:46, 65:68] = 0  # Protected hole must remain exact.
        clean = frame.copy()
        clean[mask > 0] = 90
        frame[mask > 0] = (20, 240, 20)
        frames.append(frame)
        generated.append(clean)
        cv2.imwrite(str(masks / f"{index:06d}.png"), mask)
    _write_video(original, 160, 96, 29.97, frames)
    _write_video(reconstructed, 160, 96, 29.97, generated)
    return original, reconstructed, masks, probe(str(original)), frames, generated


@pytest.mark.parametrize("strength", [0, 0.3])
def test_native_pixels_protection_empty_frames_and_fps_are_preserved(tmp_path, strength):
    original, reconstructed, masks, info, frames, generated = media(tmp_path)
    target = tmp_path / "finished.mp4"
    report = finish_subtitle_video(str(original), str(reconstructed), str(masks), str(target), info, strength=strength)
    result = list(read_frames(str(target)))
    assert len(result) == info.frames
    assert probe(str(target)).fps == pytest.approx(info.fps)
    for index, frame in enumerate(result):
        mask = cv2.imread(str(masks / f"{index:06d}.png"), 0) > 0
        assert np.array_equal(frame[~mask], frames[index][~mask])
        if mask.any():
            # Finishing cannot blend the bright green original lettering back.
            assert frame[mask][:, 1].max() < 115
        if strength == 0:
            assert np.array_equal(frame[mask], generated[index][mask])
    assert len(report["donor_frames"]) <= 8
    assert target.with_suffix(".json").is_file()


def test_incomplete_reconstruction_keeps_previous_output_intact(tmp_path):
    original, reconstructed, masks, info, _, generated = media(tmp_path)
    _write_video(reconstructed, 160, 96, info.fps, generated[:-1])
    target = tmp_path / "finished.mp4"
    target.write_bytes(b"previous-reviewed-output")
    with pytest.raises(ValueError, match="frame count"):
        finish_subtitle_video(str(original), str(reconstructed), str(masks), str(target), info)
    assert target.read_bytes() == b"previous-reviewed-output"
    assert not target.with_suffix(".json").exists()


def test_cancel_and_invalid_masks_do_not_create_candidate(tmp_path):
    original, reconstructed, masks, info, _, _ = media(tmp_path)
    target = tmp_path / "finished.mp4"
    cancel = tmp_path / ".cancel"
    cancel.touch()
    with pytest.raises(RuntimeError, match="cancelled"):
        finish_subtitle_video(str(original), str(reconstructed), str(masks), str(target), info, cancel_file=str(cancel))
    assert not target.exists()
    (masks / "000001.png").rename(masks / "000008.png")
    with pytest.raises(ValueError, match="mask sequence"):
        finish_subtitle_video(str(original), str(reconstructed), str(masks), str(target), info)
    assert not target.exists()


def test_source_output_alias_is_rejected(tmp_path):
    original, reconstructed, masks, info, _, _ = media(tmp_path)
    content = original.read_bytes()
    with pytest.raises(ValueError, match="separate"):
        finish_subtitle_video(str(original), str(reconstructed), str(masks), str(original), info)
    assert original.read_bytes() == content


def test_official_pipeline_uses_finishing_only_when_enabled(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from app.workers import tasks
    original, reconstructed, masks, info, _, _ = media(tmp_path)
    monkeypatch.setenv("CLEANER_SUBTITLE_FINISH", "1")
    monkeypatch.setattr(tasks, "_write_mask_sequence", lambda *args, **kwargs: info.frames)
    monkeypatch.setattr(tasks, "prepare_subtitle_policy", lambda *args, **kwargs: SimpleNamespace(
        inference_mask_dir=str(masks), composite_mask_dir=str(masks),
        reference_stride=2, temporal_window=32, report={"test": True}))
    monkeypatch.setattr(tasks, "run_propainter", lambda *args, **kwargs: str(reconstructed))
    output = tmp_path / "final.mp4"
    _, metrics, count = tasks._run_official_pipeline(
        str(original), str(output), str(tmp_path), [], info, "subtitle", "quality",
        True, 1, False, False, lambda *args: None)
    assert count == info.frames
    assert metrics["subtitle_finish"]["revision"] == "subtitle-finish-v1"
    assert probe(str(output)).frames == info.frames
    assert original.exists() and reconstructed.exists()
