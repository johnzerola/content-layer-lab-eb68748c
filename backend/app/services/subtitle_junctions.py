"""Scene-bounded phase-2 comparison; no GPU or product-default mutation."""
from itertools import zip_longest
import json
from pathlib import Path
import shutil
import tempfile
import time

import cv2
import numpy as np

from .inference_region import _write_video, _check_cancel
from .mask import build_masks_window
from .text_detect import frame_text_mask, detector_status
from ..utils.video import read_frames
from ..video.subtitle_junctions import Donor, exclusion_mask, refine_junctions


def _refine_subtitle_scene(original, native, raw_masks, composite_masks, destination,
                           info, regions, *, cancel_file=None):
    target = Path(destination).resolve()
    target.mkdir(parents=True, exist_ok=False)
    report_path = target / "subtitle-junctions.report.json"
    report = {
        "revision": "subtitle-junctions-v1", "started": True, "completed": False,
        "started_at_unix": time.time(), "frames_analyzed": 0,
        "frames_with_accepted_donor": 0, "frames_fallback": 0,
        "frame_reports": [], "failure": None,
    }
    def persist_report():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        (target / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    persist_report()
    expected = {f"{i:06d}.png" for i in range(info.frames)}
    for folder in (raw_masks, composite_masks):
        if {p.name for p in Path(folder).iterdir()} != expected:
            raise ValueError("invalid phase-2 mask sequence")
    def mask(folder, i):
        m = cv2.imread(str(Path(folder) / f"{i:06d}.png"), 0)
        if m is None or m.shape != (info.height, info.width):
            raise ValueError("invalid phase-2 mask geometry")
        return m
    left, top, right, bottom = info.width, info.height, 0, 0
    areas = []
    for i in range(info.frames):
        _check_cancel(cancel_file)
        m = mask(composite_masks, i)
        x, y, w, h = cv2.boundingRect(m)
        if w and h:
            left, top, right, bottom = min(left, x), min(top, y), max(right, x + w), max(bottom, y + h)
        areas.append(int(np.count_nonzero(mask(raw_masks, i))))
    if right <= left:
        left, top, right, bottom = 0, 0, min(64, info.width), min(64, info.height)
    else:
        left, top, right, bottom = max(0, left - 64), max(0, top - 64), min(info.width, right + 64), min(info.height, bottom + 64)
    width, height = right - left, bottom - top
    if min(width, height) < 64 or width * height > 1_048_576 or max(width, height) > 1536:
        raise ValueError("phase-2 crop outside resource budget")
    required = width * height * info.frames * 12
    if required > 2 * 1024**3 or shutil.disk_usage(target).free < required + 256 * 1024**2:
        raise RuntimeError("insufficient phase-2 workspace budget")
    def crop(a):
        return a[top:bottom, left:right]
    def selected(i):
        remove, protect = build_masks_window(regions, info.width, info.height, i, 1, info.fps)
        return crop(cv2.bitwise_and(remove[0], cv2.bitwise_not(protect[0])))
    ranked = sorted(range(info.frames), key=lambda i: (areas[i], i))
    donor_indices = list(ranked[:2])
    for bucket in np.array_split(np.arange(info.frames), min(6, info.frames)):
        i = min((int(i) for i in bucket), key=lambda i: (areas[i], i))
        if i not in donor_indices:
            donor_indices.append(i)
    cached = {}
    streams = read_frames(str(original)), read_frames(str(native))
    count = 0
    try:
        for i, (a, b) in enumerate(zip_longest(*streams)):
            _check_cancel(cancel_file)
            shape = (info.height, info.width, 3)
            if a is None or b is None or a.shape != shape or b.shape != shape or i >= info.frames:
                raise ValueError("phase-2 source/reconstruction mismatch")
            if i in donor_indices:
                allowed = selected(i)
                roi = np.zeros((info.height, info.width), np.uint8)
                crop(roi)[:] = allowed
                redetected = frame_text_mask(a, roi=roi, subtitle_only=True)
                core = exclusion_mask(crop(a), cv2.bitwise_or(crop(mask(raw_masks, i)), crop(redetected)), allowed)
                guide = crop(a).copy()
                active = (crop(mask(composite_masks, i)) > 0) & (allowed > 0)
                guide[active] = crop(b)[active]
                cached[i] = Donor(crop(a).copy(), guide, core)
            count += 1
        if count != info.frames:
            raise ValueError("phase-2 incomplete source")
    finally:
        for stream in streams:
            stream.close()
    report.update({"frames": info.frames,
              "crop_xyxy": [left, top, right, bottom], "donor_indices": donor_indices,
              "original_pixels_recovered": 0, "donor_pixels_changed": 0,
              "scope": "scene-local neural reconstruction; mask transitions and verified original donors only",
              "donor_detector": detector_status(), "donor_masks": "cached masks OR new detection, connected effects and halo"})
    persist_report()
    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="junctions-", dir=target) as temp:
        scratch = Path(temp)
        def frames():
            streams = read_frames(str(original)), read_frames(str(native))
            count = 0
            try:
                for i, (a, b) in enumerate(zip_longest(*streams)):
                    _check_cancel(cancel_file)
                    if a is None or b is None or i >= info.frames:
                        raise ValueError("phase-2 incomplete rendering sequence")
                    allowed = selected(i)
                    core = exclusion_mask(crop(a), crop(mask(raw_masks, i)), allowed)
                    candidates = [j for j in donor_indices if j != i]
                    chosen = sorted(candidates, key=lambda j: (areas[j], abs(i - j)))[:2]
                    for j in sorted(candidates, key=lambda j: abs(i - j)):
                        if len(chosen) == 4:
                            break
                        if j not in chosen:
                            chosen.append(j)
                    masks_only, refined, stats = refine_junctions(crop(a), crop(b), crop(mask(composite_masks, i)),
                                                                core, allowed, [cached[j] for j in chosen])
                    stats.update(frame=i, donors_used=chosen)
                    for donor_report in stats.get("donor_reports", []):
                        candidate = donor_report.get("candidate_index")
                        donor_report["frame_index"] = chosen[candidate] if isinstance(candidate, int) and candidate < len(chosen) else None
                    report["frame_reports"].append(stats)
                    report["frames_analyzed"] += 1
                    report["frames_with_accepted_donor"] += int(stats.get("consensus_pixels", 0) > 0)
                    report["frames_fallback"] += int(bool(stats.get("fallback")))
                    for key in ("original_pixels_recovered", "donor_pixels_changed"):
                        report[key] += stats[key]
                    if not cv2.imwrite(str(scratch / f"{i:06d}.png"), refined):
                        raise RuntimeError("phase-2 temporary frame write failed")
                    persist_report()
                    crop(a)[:] = masks_only
                    yield a
                    count += 1
                if count != info.frames:
                    raise ValueError("phase-2 incomplete output")
            finally:
                for stream in streams:
                    stream.close()
        _write_video(target / "mask-master.mp4", info.width, info.height, info.fps, frames())
        def references():
            stream = read_frames(str(original))
            try:
                for i, a in enumerate(stream):
                    _check_cancel(cancel_file)
                    patch = cv2.imread(str(scratch / f"{i:06d}.png"))
                    if patch is None or patch.shape != (height, width, 3):
                        raise ValueError("invalid phase-2 temporary output")
                    crop(a)[:] = patch
                    yield a
            finally:
                stream.close()
        _write_video(target / "reference-master.mp4", info.width, info.height, info.fps, references())
    report["seconds"] = time.monotonic() - start
    report["completed"] = True
    report["ended_at_unix"] = time.time()
    persist_report()
    return report


def refine_subtitle_scene(original, native, raw_masks, composite_masks, destination,
                          info, regions, *, cancel_file=None):
    """Run junction recovery while leaving a readable partial report on error."""
    target = Path(destination).resolve()
    started = time.monotonic()
    try:
        return _refine_subtitle_scene(
            original, native, raw_masks, composite_masks, destination,
            info, regions, cancel_file=cancel_file,
        )
    except BaseException as exc:
        target.mkdir(parents=True, exist_ok=True)
        report_path = target / "subtitle-junctions.report.json"
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception:
            report = {
                "revision": "subtitle-junctions-v1", "started": True,
                "completed": False, "frames_analyzed": 0,
                "frames_with_accepted_donor": 0, "frames_fallback": 0,
                "frame_reports": [],
            }
        report.update(
            completed=False,
            ended_at_unix=time.time(),
            seconds=report.get("seconds", time.monotonic() - started),
            failure={"type": type(exc).__name__, "message": str(exc)},
        )
        serialized = json.dumps(report, ensure_ascii=False, indent=2)
        report_path.write_text(serialized, encoding="utf-8")
        (target / "report.json").write_text(serialized, encoding="utf-8")
        raise
