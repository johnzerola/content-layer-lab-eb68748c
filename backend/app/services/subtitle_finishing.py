"""Bounded, scene-local finishing after inpainting; original video is the only donor.

The caller must isolate scene cuts. Cache at most eight native crops, never a
whole video. No paid model, generated noise, resizing or extra GPU pass is used.
"""
from __future__ import annotations

from itertools import zip_longest
import json
from pathlib import Path
import time

import cv2
import numpy as np

from .inference_region import _write_video
from ..utils.video import Probe, read_frames
from ..video.subtitle_finish import FinishState, finish_frame
from ..video.subtitle_references import recover_detail


FINISH_REVISION = "subtitle-finish-v1"


def _cancel(path):
    if path and Path(path).exists():
        raise RuntimeError("subtitle finishing cancelled")


def _mask(directory, index, info):
    mask = cv2.imread(str(Path(directory) / f"{index:06d}.png"), 0)
    if mask is None or mask.shape != (info.height, info.width):
        raise ValueError("invalid subtitle finishing mask sequence")
    return np.where(mask > 0, 255, 0).astype(np.uint8)


def finish_subtitle_video(original: str, reconstructed: str, mask_dir: str,
                          destination: str, info: Probe, *, cancel_file=None,
                          strength: float = 0.3) -> dict:
    """Write a lossless intermediate and report actual accepted corrections.

Only composition-mask pixels can change. Caller retains source audio at final
assembly. Invalid/misaligned sequences fail before publishing the intermediate.
"""
    started = time.monotonic()
    if not np.isfinite(strength) or not 0 <= strength <= 0.4:
        raise ValueError("finishing strength must be between zero and 0.4")
    if info.frames < 1 or info.width < 1 or info.height < 1 or info.fps <= 0:
        raise ValueError("invalid finishing video geometry")
    target = Path(destination).resolve()
    if target in (Path(original).resolve(), Path(reconstructed).resolve()):
        raise ValueError("finishing output must be separate from input")
    expected_names = {f"{index:06d}.png" for index in range(info.frames)}
    if {p.name for p in Path(mask_dir).glob("*.png")} != expected_names:
        raise ValueError("invalid subtitle finishing mask sequence")
    areas = []
    left, top, right, bottom = info.width, info.height, 0, 0
    for index in range(info.frames):
        _cancel(cancel_file)
        mask = _mask(mask_dir, index, info)
        areas.append(int(cv2.countNonZero(mask)))
        x, y, width, height = cv2.boundingRect(mask)
        if width and height:
            left, top, right, bottom = min(left, x), min(top, y), max(right, x + width), max(bottom, y + height)
    if right > left:
        left, top = max(0, left - 48), max(0, top - 48)
        right, bottom = min(info.width, right + 48), min(info.height, bottom + 48)
    else:
        left, top, right, bottom = 0, 0, min(info.width, 32), min(info.height, 32)
    pixels = (right - left) * (bottom - top)
    # Above one megapixel use appearance calibration alone. Matching large
    # removal regions is outside the subtitle-specific CPU finishing budget.
    donor_count = min(8, info.frames) if pixels <= 1_000_000 and strength else 0
    chosen = []
    if donor_count:
        for indices in np.array_split(np.arange(info.frames), donor_count):
            center = float(indices.mean())
            chosen.append(min((int(i) for i in indices), key=lambda i: (areas[i], abs(i - center))))
    donors = {}
    stream = read_frames(original)
    try:
        count = 0
        for index, frame in enumerate(stream):
            _cancel(cancel_file)
            if index >= info.frames or frame.shape != (info.height, info.width, 3):
                raise ValueError("original frame count or geometry differs from finishing masks")
            if index in chosen:
                donors[index] = (frame[top:bottom, left:right].copy(),
                                 _mask(mask_dir, index, info)[top:bottom, left:right].copy())
            count += 1
        if count != info.frames:
            raise ValueError("original frame count differs from finishing masks")
    finally:
        stream.close()

    report = {"revision": FINISH_REVISION, "frames": info.frames, "strength": strength,
              "crop_xyxy": [left, top, right, bottom], "donor_frames": chosen,
              "donor_source": "same-scene original with dilated exclusion masks",
              "reference_frames_changed": 0, "finish_frames_changed": 0,
              "changed_pixels": 0, "max_channel_delta": 0, "frame_reports": []}
    state = FinishState()

    def frames():
        source, model = read_frames(original), read_frames(reconstructed)
        count = 0
        try:
            for index, (original_frame, reconstructed_frame) in enumerate(zip_longest(source, model)):
                _cancel(cancel_file)
                if (index >= info.frames or original_frame is None or reconstructed_frame is None
                        or original_frame.shape != (info.height, info.width, 3)
                        or reconstructed_frame.shape != original_frame.shape):
                    raise ValueError("reconstruction frame count or geometry differs from original")
                mask = _mask(mask_dir, index, info)
                result = original_frame.copy()
                result[mask > 0] = reconstructed_frame[mask > 0]
                detail_report, finish_report = {}, {}
                if mask.any() and strength:
                    source_crop = original_frame[top:bottom, left:right]
                    model_crop = reconstructed_frame[top:bottom, left:right]
                    selected = mask[top:bottom, left:right]
                    # Four nearest cached references bound per-frame matching;
                    # a frame cannot use itself as a donor.
                    nearby = sorted((i for i in donors if i != index), key=lambda i: (abs(i - index), i))[:4]
                    detailed, detail_report = recover_detail(source_crop, model_crop, selected,
                        [donors[i] for i in nearby], strength=min(strength, 0.25))
                    _cancel(cancel_file)
                    finished, finish_report = finish_frame(source_crop, detailed, selected, state,
                                                          strength=strength)
                    active = selected > 0
                    crop = result[top:bottom, left:right]
                    crop[active] = finished[active]
                    reference_changed = np.any(detailed[active] != model_crop[active])
                    finish_changed = np.any(finished[active] != detailed[active])
                    report["reference_frames_changed"] += int(reference_changed)
                    report["finish_frames_changed"] += int(finish_changed)
                    delta = np.abs(crop.astype(np.int16) - model_crop.astype(np.int16))
                    report["changed_pixels"] += int(np.count_nonzero(np.any(delta > 0, axis=2) & active))
                    report["max_channel_delta"] = max(report["max_channel_delta"], int(delta[active].max()))
                else:
                    state.reset()
                report["frame_reports"].append({"frame": index, "references": detail_report, "finish": finish_report})
                count += 1
                yield result
            if count != info.frames:
                raise ValueError("incomplete finishing frame sequence")
        finally:
            source.close()
            model.close()

    _write_video(target, info.width, info.height, info.fps, frames())
    report["seconds"] = round(time.monotonic() - started, 3)
    target.with_suffix(".json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return {key: value for key, value in report.items() if key != "frame_reports"}
