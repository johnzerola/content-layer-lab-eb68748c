"""Conservative scene-local masks for subtitle reconstruction and composition.

The caller must split scene cuts before calling this policy. Inference receives
a stable subtitle band on detected frames; composition uses each frame's own
tighter rectangle. Empty edge frames remain candidates for clean references,
not evidence of truly clean content. Original mask files are never modified.

Two streaming passes keep only O(frame_count) boxes and a few native-size masks
in memory. No video pixels, color-specific heuristics or GPU models are used.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path

import cv2
import numpy as np

from .mask import build_masks_window
from ..utils.video import Probe


@dataclass(frozen=True)
class SubtitlePolicy:
    inference_mask_dir: str
    composite_mask_dir: str
    reference_stride: int
    temporal_window: int
    report: dict


def _check_cancel(cancel_file: str | None) -> None:
    if cancel_file and Path(cancel_file).exists():
        raise RuntimeError("subtitle policy cancelled")


def _read_mask(path: Path, info: Probe) -> np.ndarray:
    mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if mask is None or mask.shape != (info.height, info.width):
        raise ValueError(f"invalid native mask dimensions or unreadable mask: {path.name}")
    return np.where(mask > 0, 255, 0).astype(np.uint8)


def _allowed(regions: list, info: Probe, index: int) -> np.ndarray:
    remove, protect = build_masks_window(regions, info.width, info.height, index, 1, info.fps)
    return cv2.bitwise_and(remove[0], cv2.bitwise_not(protect[0]))


def _box(mask: np.ndarray):
    points = cv2.findNonZero(mask)
    if points is None:
        return None
    x, y, width, height = cv2.boundingRect(points)
    return (x, y, x + width, y + height)


def _union(left, right):
    if left is None:
        return right
    if right is None:
        return left
    return (min(left[0], right[0]), min(left[1], right[1]),
            max(left[2], right[2]), max(left[3], right[3]))


def _rectangle(box, info: Probe) -> np.ndarray:
    mask = np.zeros((info.height, info.width), dtype=np.uint8)
    if box is not None:
        x0, y0, x1, y1 = box
        mask[y0:y1, x0:x1] = 255
    return mask


def prepare_subtitle_policy(mask_dir: str, job_dir: str, regions: list,
                            info: Probe, cancel_file=None) -> SubtitlePolicy:
    """Build two constrained mask sequences for one scene, without inference.

    Only internal empty runs of at most 0.2 seconds are bridged. Large scene
    bands (>40% of native height) disable rectangle expansion and gap filling.
    Remove/protect shapes and time intervals are reapplied after every expansion.
    Short scenes use dense references. Scenes up to 80 frames with consecutive
    empty references can keep those references within the whole temporal window.
    """
    if info.frames < 1 or info.width < 1 or info.height < 1 or not math.isfinite(info.fps) or info.fps <= 0:
        raise ValueError("invalid scene geometry or frame rate")
    _check_cancel(cancel_file)
    source = Path(mask_dir).resolve(strict=True)
    paths = [source / f"{index:06d}.png" for index in range(info.frames)]
    actual = {path.name for path in source.iterdir() if path.is_file() and path.suffix.lower() == ".png"}
    if actual != {path.name for path in paths}:
        raise ValueError("mask count or frame numbering does not match the scene")

    boxes, input_areas = [], []
    band = None
    # The first pass validates every frame before creating output directories.
    for index, path in enumerate(paths):
        _check_cancel(cancel_file)
        constrained = cv2.bitwise_and(_read_mask(path, info), _allowed(regions, info, index))
        box = _box(constrained)
        boxes.append(box)
        input_areas.append(int(cv2.countNonZero(constrained)))
        band = _union(band, box)

    fallback = band is not None and (band[3] - band[1]) / info.height > 0.4
    # A run of very short words can reveal useful parts of the background even
    # without a completely empty frame. Do not hide those partial references
    # behind the scene-wide band (e.g. a buckle visible below a short caption).
    partial_reference_run = 0
    longest_partial_run = 0
    band_area = (band[2] - band[0]) * (band[3] - band[1]) if band else 0
    for box in boxes:
        area = (box[2] - box[0]) * (box[3] - box[1]) if box else 0
        partial_reference_run = partial_reference_run + 1 if 0 < area < band_area * 0.18 else 0
        longest_partial_run = max(longest_partial_run, partial_reference_run)
    preserve_partial = (not fallback and None not in boxes
                        and longest_partial_run >= max(3, math.ceil(info.fps * 0.1)))
    filled_boxes = list(boxes)
    gap_limit = int(math.floor(0.2 * info.fps + 1e-9))
    if not fallback and gap_limit:
        previous = None
        for index, box in enumerate(boxes):
            if box is None:
                continue
            if previous is not None and 0 < index - previous - 1 <= gap_limit:
                gap_box = _union(boxes[previous], box)
                for missing in range(previous + 1, index):
                    filled_boxes[missing] = gap_box
            previous = index

    target = Path(job_dir).resolve() / "subtitle-policy"
    if target == source or source.is_relative_to(target):
        raise ValueError("policy output must be separate from original masks")
    target.mkdir(parents=True, exist_ok=False)
    inference_dir, composite_dir = target / "inference-masks", target / "composite-masks"
    inference_dir.mkdir()
    composite_dir.mkdir()
    inference_areas, composite_areas, candidates, gap_filled = [], [], [], []
    for index, path in enumerate(paths):
        _check_cancel(cancel_file)
        allowed = _allowed(regions, info, index)
        if fallback:
            inference = cv2.bitwise_and(_read_mask(path, info), allowed)
            composite = inference.copy()
        else:
            box = filled_boxes[index]
            composite = cv2.bitwise_and(_rectangle(box, info), allowed)
            inference = composite.copy() if preserve_partial else cv2.bitwise_and(
                _rectangle(band if box is not None else None, info), allowed)
        inference_area, composite_area = int(cv2.countNonZero(inference)), int(cv2.countNonZero(composite))
        inference_areas.append(inference_area)
        composite_areas.append(composite_area)
        if inference_area == 0:
            candidates.append(index)
        if boxes[index] is None and composite_area > 0:
            gap_filled.append(index)
        if not cv2.imwrite(str(inference_dir / path.name), inference) or not cv2.imwrite(str(composite_dir / path.name), composite):
            raise RuntimeError("failed to write subtitle policy masks")

    total_pixels = info.width * info.height * info.frames
    candidate_set = set(candidates)
    consecutive_candidates = any(index + 1 in candidate_set for index in candidates)
    full_scene_references = (not fallback and 32 < info.frames <= 80
                             and consecutive_candidates
                             and any(index % 10 == 0 for index in candidates))
    temporal_window = 80 if full_scene_references else 32
    reference_stride = 2 if info.frames <= 96 else 10
    if full_scene_references:
        reference_stride = 10
    report = {
        "policy": "scene-local-dual-subtitle-masks-v1", "frames": info.frames,
        "band_bbox": list(band) if band is not None else None,
        "fallback": "band_taller_than_40_percent" if fallback else None,
        "inference_mask_policy": "dynamic_partial_references" if preserve_partial else "stable_band",
        "longest_partial_reference_run": longest_partial_run,
        "max_gap_seconds": 0.2, "max_gap_frames": gap_limit,
        "gap_filled_frames": gap_filled, "gap_filled_count": len(gap_filled),
        "clean_frame_candidates": candidates, "clean_frame_candidate_count": len(candidates),
        "candidate_note": "Empty masks are reference candidates, not verified clean frames.",
        "reference_stride": reference_stride,
        "temporal_window": temporal_window,
        "temporal_policy": "whole_short_scene_references" if full_scene_references else "bounded_dense_references",
        "mask_areas": {"input": input_areas, "inference": inference_areas, "composite": composite_areas},
        "mean_coverage": {"input": sum(input_areas) / total_pixels,
                          "inference": sum(inference_areas) / total_pixels,
                          "composite": sum(composite_areas) / total_pixels},
    }
    (target / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return SubtitlePolicy(str(inference_dir), str(composite_dir), reference_stride, temporal_window, report)
