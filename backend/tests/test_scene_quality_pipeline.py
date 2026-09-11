import shutil
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
import pytest

from app.services.chunking import plan_chunks
from app.services.mask_modes import karaoke_union
from app.services.tracking import stabilize
from app.services.scene_pipeline import frame_spans, run_scenes
from app.services.quality_policy import review_issues, should_try_alternative, prefer_alternative
from app.utils.video import RawWriter, probe, read_frames
from app.workers.tasks import _run_official_pipeline, _run_diffusion_pipeline, _window_masks
from app.services.watermark import _graphic_on_flat_border


def test_small_moving_subtitle_does_not_become_a_global_stripe():
    masks = np.zeros((5, 400, 300), np.uint8)
    masks[0:2, 300:308, 10:20] = 255
    masks[3:5, 300:308, 100:110] = 255
    for result in (karaoke_union(masks), stabilize(masks)):
        assert not result[2].any()
        assert not result[0][:, 100:].any()
        assert not result[4][:, :90].any()
        assert np.count_nonzero(result[0]) == 80


def test_karaoke_does_not_bridge_spaces_between_words():
    masks = np.zeros((3, 50, 100), np.uint8)
    masks[:, 20:30, 10:20] = 255
    masks[:, 20:30, 40:50] = 255
    result = karaoke_union(masks)
    assert all(not mask[:, 22:38].any() for mask in result)


def test_whole_graphic_requires_uniform_outer_canvas_and_no_motion():
    frame = np.zeros((400, 200, 3), np.uint8)
    frame[20:40, 20:40] = 180
    candidate = {"x": 0.1, "y": 0.05, "w": 0.1, "h": 0.05}
    assert _graphic_on_flat_border(candidate, [frame, frame.copy()])
    changed = frame.copy()
    changed[20:40, 20:40] = 0
    assert not _graphic_on_flat_border(candidate, [frame, changed])
    assert not _graphic_on_flat_border({**candidate, "y": 0.5}, [frame])
    busy = frame.copy()
    busy[15:20, 15:45:2] = 255
    assert not _graphic_on_flat_border(candidate, [busy])


def test_smart_preserves_full_confirmed_graphic_not_only_its_text():
    frame = np.zeros((100, 100, 3), np.uint8)
    region = {"kind": "rect", "role": "remove", "x": 0.1, "y": 0.1,
              "w": 0.2, "h": 0.2, "mask_kind": "graphic"}
    empty = np.zeros((100, 100), np.uint8)
    with patch("app.workers.tasks.frame_text_mask", return_value=empty), \
         patch("app.workers.tasks.frame_watermark_mask", return_value=empty):
        masks = _window_masks([frame], [region], SimpleNamespace(width=100,height=100,fps=30),
                              "smart", True, 1, 0, False)
    assert masks[0][20, 20] == 255
    assert not masks[0][50:, :].any()


def test_karaoke_checks_every_frame_even_when_the_background_probe_is_identical():
    frames = [np.full((40, 60, 3), 80, np.uint8) for _ in range(4)]
    detected = []
    for x in (5, 15, 25, 35):
        mask = np.zeros((40, 60), np.uint8)
        mask[25:30, x:x + 5] = 255
        detected.append(mask)
    info = SimpleNamespace(width=60, height=40, fps=30)
    regions = [{"kind": "rect", "role": "remove", "x": 0, "y": 0, "w": 1, "h": 1}]
    with patch("app.workers.tasks.frame_text_mask", side_effect=detected) as detector:
        result = _window_masks(frames, regions, info, "karaoke", True, 4, 0, False)
    assert detector.call_count == 4
    assert len(result) == 4


def test_subtitle_shadow_halo_respects_timed_protection_and_empty_frames():
    frames = [np.full((100, 160, 3), 80, np.uint8)] * 2
    detected = np.zeros((100, 160), np.uint8)
    detected[70:78, 60:85] = 255
    regions = [
        {"kind": "rect", "role": "remove", "x": .25, "y": .6, "w": .5, "h": .3},
        {"kind": "rect", "role": "protect", "x": .5, "y": .65, "w": .1, "h": .2, "from": 0, "to": .1},
    ]
    with patch.dict("os.environ", {"CLEANER_SUBTITLE_SHADOW_PX": "10"}), \
         patch("app.workers.tasks.frame_text_mask", side_effect=[detected, np.zeros_like(detected)]):
        masks = _window_masks(frames, regions, SimpleNamespace(width=160, height=100, fps=30),
                              "karaoke", True, 1, 0, False)
    assert masks[0, 65, 62] == 255  # Beyond the glyph, over its shadow.
    assert not masks[0, 65:86, 80:97].any()  # Protected hole stays protected.
    assert not masks[0, :60].any() and not masks[0, :, :40].any()
    assert not masks[1].any()


def test_short_video_still_splits_at_each_scene_cut():
    chunks = plan_chunks(5, target_seconds=15, overlap=0.6, cuts=[0, 1, 2.5, 4])
    assert [(c.start, c.end) for c in chunks] == [(0, 1), (1, 2.5), (2.5, 4), (4, 5)]
    assert all(c.overlap == 0 for c in chunks)


def test_context_never_crosses_scene_boundaries_and_covers_whole_video():
    chunks = plan_chunks(100, 15, 0.6, cuts=[37, 60])
    assert chunks[0].start == 0 and chunks[-1].end == 100
    assert all(a.end == b.start for a, b in zip(chunks, chunks[1:]))
    for chunk in chunks:
        scene_start, scene_end = next((a, b) for a, b in [(0, 37), (37, 60), (60, 100)]
                                     if a <= chunk.start < b)
        assert chunk.read_start >= scene_start
        assert chunk.read_start + chunk.read_duration <= scene_end + 1e-8


def test_chunk_limit_fails_before_partial_gpu_plan():
    with pytest.raises(ValueError, match="muitas cenas"):
        plan_chunks(10, cuts=list(range(1, 10)), max_chunks=3)
    assert frame_spans(10, [-1, 0, 3, 3, 10, 12]) == [(0, 3), (3, 10)]


@pytest.mark.parametrize("engine", ["propainter", "diffueraser"])
def test_both_official_engines_dispatch_by_scene_before_inference(engine):
    info = SimpleNamespace(frames=60)
    arguments = ["source", "output", "job", [], info, "karaoke"]
    if engine == "propainter":
        arguments.append("quality")
    arguments.extend([True, 4, False, True, lambda *_: None])
    function = _run_official_pipeline if engine == "propainter" else _run_diffusion_pipeline
    with patch("app.workers.tasks.run_scenes", return_value=([], {}, 60)) as dispatch:
        function(*arguments, scene_cuts=[30])
    assert dispatch.call_args.args[5] == [30]


def test_legacy_refined_diffusion_uses_wide_inference_and_tight_composite(tmp_path):
    info = SimpleNamespace(width=100, height=60, fps=10, frames=3, duration=.3, has_audio=False)
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    masks = tmp_path / "reviewed"
    masks.mkdir()
    for index, box in enumerate((None, (10, 40, 30, 48), (20, 40, 50, 48))):
        mask = np.zeros((60, 100), np.uint8)
        if box:
            x0, y0, x1, y1 = box
            mask[y0:y1, x0:x1] = 255
        assert cv2.imwrite(str(masks / f"{index:06d}.png"), mask)
    regions = [{"kind": "rect", "role": "remove", "x": 0, "y": 0, "w": 1, "h": 1}]
    captured = {}

    def prepare_region(_source, mask_dir, *_args, **_kwargs):
        captured["inference"] = mask_dir
        return SimpleNamespace(active=True, source_path=str(source), mask_dir=mask_dir,
                               width=100, height=60)

    def composite(_source, reconstructed, mask_dir, *_args):
        captured["composite"] = mask_dir
        return reconstructed

    with patch("app.workers.tasks._prepare_official_region", side_effect=prepare_region), \
         patch("app.workers.tasks.masks_to_video"), \
         patch("app.workers.tasks.run_diffueraser", return_value=str(source)), \
         patch("app.workers.tasks.restore_inference_region", return_value=str(source)), \
         patch("app.workers.tasks._composite_step", side_effect=composite), \
         patch("app.workers.tasks._audit_video", return_value=([], {"residual_text": 0,
               "sharpness_ratio": 1, "temporal_consistency": 1})), \
         patch("app.workers.tasks.mux_audio"):
        _, metrics, frames = _run_diffusion_pipeline(
            str(source), str(tmp_path / "output.mp4"), str(tmp_path / "job"), regions,
            info, "subtitle", True, 1, False, True, lambda *_: None,
            prepared_mask_dir=str(masks), quality_profile="legacy_refined")

    assert frames == 3
    assert captured["inference"].endswith("inference-masks")
    assert captured["composite"].endswith("composite-masks")
    assert metrics["subtitle_policy"]["policy"] == "scene-local-dual-subtitle-masks-v1"


def test_quality_policy_does_not_treat_missing_ocr_or_nan_as_success():
    good = {"residual_text": 0, "sharpness_ratio": 1, "temporal_consistency": 1}
    assert review_issues(good) == []
    assert review_issues(good, verified=False)
    assert review_issues({**good, "residual_text": float("nan")})
    assert review_issues({})
    assert not should_try_alternative({**good, "residual_text": 0.8})
    primary = {**good, "sharpness_ratio": 0.1}
    assert should_try_alternative(primary)
    assert prefer_alternative(primary, good)
    assert not prefer_alternative(primary, {**good, "temporal_consistency": 0.5})


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")
def test_real_media_split_assembly_preserves_frames_and_localizes_masks(tmp_path):
    source = str(tmp_path / "original.mp4")
    writer = RawWriter(source, 64, 64, 10, crf=0)
    try:
        for index in range(20):
            frame = np.zeros((64, 64, 3), np.uint8)
            frame[:, :, 2 if index < 10 else 0] = 255
            writer.write(frame)
    finally:
        writer.close()
    info = probe(source)
    calls = []

    def identity_engine(input_path, output_path, directory, regions, part_info, emit):
        calls.append((regions, part_info.frames, list(read_frames(input_path))))
        shutil.copyfile(input_path, output_path)
        return [{"from": 0, "to": part_info.duration}], {
            "residual_text": 0, "sharpness_ratio": 1, "temporal_consistency": 1}, part_info.frames

    output = str(tmp_path / "result.mp4")
    segments, _, frames = run_scenes(source, output, str(tmp_path),
        [{"id": "timed", "from": 0.5, "to": 1.5}], info, [10], identity_engine, lambda *_: None)
    actual = probe(output)
    assert (actual.width, actual.height, actual.frames, frames) == (64, 64, 20, 20)
    assert actual.duration == pytest.approx(2, abs=0.02)
    assert calls[0][0][0]["from"] == 0.5
    assert calls[1][0][0]["from"] == 0
    assert calls[1][0][0]["to"] == 0.5
    assert all(frame[:, :, 2].mean() > 240 for frame in calls[0][2])
    assert all(frame[:, :, 0].mean() > 240 for frame in calls[1][2])
    assert segments[1]["from"] == 1
