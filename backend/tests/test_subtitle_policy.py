"""Scene-local mask expansion must respect time, protection and donor candidates."""
from pathlib import Path
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.subtitle_policy import prepare_subtitle_policy
from app.utils.video import Probe


def fixture(tmp_path, boxes, fps=10):
    source = tmp_path / "original-masks"
    source.mkdir()
    for index, box in enumerate(boxes):
        mask = np.zeros((60, 100), dtype=np.uint8)
        if box is not None:
            x0, y0, x1, y1 = box
            mask[y0:y1, x0:x1] = 255
        assert cv2.imwrite(str(source / f"{index:06d}.png"), mask)
    info = Probe(100, 60, fps, len(boxes), len(boxes) / fps, False)
    regions = [{"kind": "rect", "role": "remove", "x": 0, "y": 0, "w": 1, "h": 1}]
    return source, info, regions


def read(directory, index):
    return cv2.imread(str(Path(directory) / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)


def test_stable_inference_band_and_narrow_composite_preserve_original(tmp_path):
    source, info, regions = fixture(tmp_path, [None, (10, 40, 30, 48), (20, 40, 50, 48), None])
    originals = [path.read_bytes() for path in sorted(source.glob("*.png"))]
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert np.array_equal(read(result.inference_mask_dir, 1), read(result.inference_mask_dir, 2))
    assert np.count_nonzero(read(result.composite_mask_dir, 1)) == 20 * 8
    assert np.count_nonzero(read(result.inference_mask_dir, 1)) == 40 * 8
    assert result.report["clean_frame_candidates"] == [0, 3]
    assert [path.read_bytes() for path in sorted(source.glob("*.png"))] == originals
    assert result.reference_stride == 2
    assert result.report["dual_mask_audit"] == {
        "composition_subset_of_inference": True,
        "dual_mask_distinct": True,
        "equal_frame_count": 2,
        "distinct_frame_count": 2,
        "reason": "stable_inference_band_with_tighter_per_frame_composition",
    }


def test_distant_clean_references_remain_in_short_scene_window(tmp_path):
    source, info, regions = fixture(tmp_path, [None, None] + [(10, 40, 50, 48)] * 72, fps=30)
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.temporal_window >= info.frames
    assert result.reference_stride == 10
    assert not read(result.inference_mask_dir, 0).any()
    assert read(result.inference_mask_dir, 73).any()


def test_no_clean_reference_keeps_dense_window_bounded(tmp_path):
    source, info, regions = fixture(tmp_path, [(10, 40, 50, 48)] * 74, fps=30)
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.temporal_window == 32
    assert result.reference_stride == 2


def test_fills_only_short_internal_gaps_and_keeps_empty_edges(tmp_path):
    source, info, regions = fixture(tmp_path, [None, (10, 40, 20, 48), None, None, (20, 40, 30, 48),
                                              None, None, None, (15, 40, 25, 48), None])
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.report["gap_filled_frames"] == [2, 3]
    assert result.report["clean_frame_candidates"] == [0, 5, 6, 7, 9]
    assert np.count_nonzero(read(result.composite_mask_dir, 2)) == 20 * 8


def test_time_and_protect_constraints_survive_bbox_and_gap_expansion(tmp_path):
    source, info, _ = fixture(tmp_path, [(10, 40, 20, 48), None, (30, 40, 40, 48)])
    regions = [
        {"role": "remove", "x": 0.1, "y": 0.6, "w": 0.3, "h": 0.3, "to": 0.1},
        {"role": "remove", "x": 0.1, "y": 0.6, "w": 0.3, "h": 0.3, "from": 0.2},
        {"role": "protect", "x": 0.15, "y": 0.6, "w": 0.2, "h": 0.3, "from": 0.0, "to": 0.3},
    ]
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.report["gap_filled_count"] == 0
    for directory in (result.inference_mask_dir, result.composite_mask_dir):
        assert not read(directory, 1).any()
        for index in (0, 2):
            assert not read(directory, index)[:, 15:36].any()
            assert not read(directory, index)[:, :10].any()
            assert not read(directory, index)[:, 41:].any()


def test_tall_band_falls_back_without_filling_empty_gap(tmp_path):
    source, info, regions = fixture(tmp_path, [(10, 5, 20, 10), None, (30, 45, 40, 50)])
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.report["fallback"] == "band_taller_than_40_percent"
    assert result.report["gap_filled_count"] == 0
    for index in range(info.frames):
        original = read(source, index)
        assert np.array_equal(read(result.inference_mask_dir, index), original)
        assert np.array_equal(read(result.composite_mask_dir, index), original)


@pytest.mark.parametrize("fault", ["missing", "extra", "dimensions"])
def test_invalid_mask_sequence_aborts_before_writing_outputs(tmp_path, fault):
    source, info, regions = fixture(tmp_path, [(10, 40, 20, 48)] * 2)
    if fault == "missing":
        (source / "000001.png").unlink()
    elif fault == "extra":
        cv2.imwrite(str(source / "000002.png"), np.zeros((60, 100), dtype=np.uint8))
    else:
        cv2.imwrite(str(source / "000001.png"), np.zeros((30, 50), dtype=np.uint8))
    with pytest.raises(ValueError):
        prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert not (tmp_path / "job" / "subtitle-policy").exists()


def test_empty_long_scene_keeps_all_candidate_frames_and_bounded_stride(tmp_path):
    source, info, regions = fixture(tmp_path, [None] * 97)
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.reference_stride == 10
    assert result.report["clean_frame_candidate_count"] == 97
    assert result.report["mean_coverage"]["inference"] == 0


def test_cancelled_policy_leaves_originals_and_does_not_start_outputs(tmp_path):
    source, info, regions = fixture(tmp_path, [(10, 40, 20, 48)])
    cancel = tmp_path / "cancel"
    cancel.touch()
    with pytest.raises(RuntimeError, match="cancelled"):
        prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info, str(cancel))
    assert (source / "000000.png").exists()
    assert not (tmp_path / "job").exists()


def test_partial_reference_run_does_not_hide_visible_background(tmp_path):
    source, info, regions = fixture(tmp_path, [(10, 40, 15, 42)] * 3 + [(10, 40, 80, 50)] * 3)
    result = prepare_subtitle_policy(str(source), str(tmp_path / "job"), regions, info)
    assert result.report["inference_mask_policy"] == "dynamic_partial_references"
    assert not read(result.inference_mask_dir, 0)[45:50, 40:70].any()
    assert read(result.inference_mask_dir, 3)[45:50, 40:70].all()
    assert result.report["dual_mask_audit"]["composition_subset_of_inference"] is True
    assert result.report["dual_mask_audit"]["dual_mask_distinct"] is False
    assert result.report["dual_mask_audit"]["reason"] == "dynamic_partial_references_preserve_visible_background"
