"""Real media checks for stable crops, native pixels and incomplete engines."""
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
import shutil

import cv2
import numpy as np
import pytest

from app.services.inference_region import prepare_inference_region, restore_inference_region, _write_video
from app.utils.video import probe, read_frames
from app.workers.tasks import _run_official_pipeline, _run_diffusion_pipeline

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")


def fixture_video(tmp_path, count=4):
    source = tmp_path / "source.mp4"
    rng = np.random.default_rng(4)
    frames = [rng.integers(0, 256, (96, 160, 3), dtype=np.uint8) for _ in range(count)]
    _write_video(source, 160, 96, 29.97, frames)
    masks = tmp_path / "masks"
    masks.mkdir()
    for index in range(count):
        mask = np.zeros((96, 160), np.uint8)
        if index != 1:
            mask[60:67, 50 + index * 3:60 + index * 3] = 255
        cv2.imwrite(str(masks / f"{index:06d}.png"), mask)
    return source, masks, probe(str(source))


def test_temporal_union_crops_once_preserves_empty_frames_and_pixels(tmp_path):
    source, masks, info = fixture_video(tmp_path)
    region = prepare_inference_region(str(source), str(masks), str(tmp_path), info, margin=8)
    x, y, width, height = region.box
    assert region.active and region.cropped
    assert x <= 50 and x + width >= 69 and y <= 60 and y + height >= 67
    assert not cv2.imread(str(Path(region.mask_dir) / "000001.png"), 0).any()
    native, cropped = list(read_frames(str(source))), list(read_frames(region.source_path))
    assert len(cropped) == info.frames
    for a, b in zip(native, cropped):
        assert np.array_equal(a[y:y + height, x:x + width], b)
    # A deliberately different model output must not affect anything outside ROI.
    model = tmp_path / "model.mp4"
    _write_video(model, width, height, 30, [np.full_like(f, 77) for f in cropped])
    target = tmp_path / "restored.mp4"
    restore_inference_region(str(model), region, str(source), str(target), info)
    actual = probe(str(target))
    assert actual.frames == info.frames and actual.fps == pytest.approx(info.fps, abs=1e-5)
    outside = np.ones((info.height, info.width), bool)
    outside[y:y + height, x:x + width] = False
    for original, restored in zip(native, read_frames(str(target))):
        assert np.array_equal(original[outside], restored[outside])
        assert (restored[y:y + height, x:x + width] == 77).all()


def test_mask_at_edge_is_not_lost(tmp_path):
    source, masks, info = fixture_video(tmp_path)
    mask = np.zeros((96, 160), np.uint8)
    mask[-3:, -3:] = 255
    for path in masks.glob("*.png"):
        cv2.imwrite(str(path), mask)
    region = prepare_inference_region(str(source), str(masks), str(tmp_path), info, margin=0)
    x, y, w, h = region.box
    assert x + w == 160 and y + h == 96
    assert np.count_nonzero(cv2.imread(str(Path(region.mask_dir) / "000000.png"), 0)) == 9


@pytest.mark.parametrize("damage", ["missing", "size", "gap"])
def test_invalid_masks_abort_before_inference(tmp_path, damage):
    source, masks, info = fixture_video(tmp_path)
    path = masks / "000001.png"
    if damage == "missing":
        path.unlink()
    elif damage == "gap":
        path.rename(masks / "000005.png")
    else:
        cv2.imwrite(str(path), np.zeros((12, 12), np.uint8))
    with pytest.raises(ValueError, match="mascara"):
        prepare_inference_region(str(source), str(masks), str(tmp_path), info)


@pytest.mark.parametrize("extra", [-1, 1])
def test_incomplete_or_extra_model_frames_never_publish_result(tmp_path, extra):
    source, masks, info = fixture_video(tmp_path)
    region = prepare_inference_region(str(source), str(masks), str(tmp_path), info, margin=8)
    model, output = tmp_path / "model.mp4", tmp_path / "output.mp4"
    _write_video(model, region.width, region.height, 30,
                 [np.zeros((region.height, region.width, 3), np.uint8)] * (info.frames + extra))
    with pytest.raises(ValueError, match="quadros"):
        restore_inference_region(str(model), region, str(source), str(output), info)
    assert not output.exists()
    assert source.exists()


@pytest.mark.parametrize("engine", ["propainter", "diffueraser"])
def test_unmasked_scene_bypasses_gpu_and_keeps_source(tmp_path, engine):
    source, masks, info = fixture_video(tmp_path)
    for path in masks.glob("*.png"):
        cv2.imwrite(str(path), np.zeros((96, 160), np.uint8))
    output = tmp_path / "output.mp4"
    args = [str(source), str(output), str(tmp_path), [], info, "karaoke"]
    if engine == "propainter":
        args.append("quality")
    args.extend([True, 1, False, False, lambda *_: None])
    function = _run_official_pipeline if engine == "propainter" else _run_diffusion_pipeline
    with patch("app.workers.tasks._write_mask_sequence", return_value=info.frames), \
         patch(f"app.workers.tasks.run_{engine}") as gpu:
        _, metrics, count = function(*args)
    gpu.assert_not_called()
    assert source.read_bytes() == output.read_bytes()
    assert count == info.frames and metrics["no_masked_pixels"]


def test_cancel_stops_before_creating_roi(tmp_path):
    source, masks, info = fixture_video(tmp_path)
    cancel = tmp_path / "cancel"
    cancel.touch()
    with pytest.raises(RuntimeError, match="cancelado"):
        prepare_inference_region(str(source), str(masks), str(tmp_path), info, cancel_file=str(cancel))


def test_scene_without_timed_region_is_preserved(tmp_path):
    from app.services.scene_pipeline import run_scenes
    source, _, info = fixture_video(tmp_path)
    calls = []
    def model(src, out, directory, regions, part, emit):
        calls.append(part.frames)
        shutil.copyfile(src, out)
        return [], {"residual_text": 0, "sharpness_ratio": 1, "temporal_consistency": 1}, part.frames
    target = tmp_path / "joined.mp4"
    run_scenes(str(source), str(target), str(tmp_path), [{"from": 0, "to": 2/info.fps}],
               info, [2], model, lambda *_: None)
    assert calls == [2]
    assert probe(str(target)).frames == info.frames
