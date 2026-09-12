"""CPU-only Pedro post-engine validation for failure-observability work."""
from __future__ import annotations

import json
from itertools import zip_longest
from pathlib import Path
import shutil
import sys
import time

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.inference_region import prepare_inference_region, restore_inference_region
from app.services.subtitle_junctions import refine_subtitle_scene
from app.utils.video import probe, read_frames


SOURCE = Path(r"G:\dowloand\teste\regression-fix-validation-20260911\pedro-01\media\input.mp4")
ARCHIVED_ENGINE = Path(r"G:\dowloand\teste\runpod-phase6-20260911\pedro-01\gpu-candidate-pedro-01-5s.mp4")
EVIDENCE = Path(r"G:\dowloand\teste\regression-fix-validation-20260911\pedro-01\mask-evidence\corrected")
REGIONS = Path(r"G:\dowloand\teste\regression-fix-validation-20260911\pedro-01\contract\regions-pedro-wide.json")
OUTPUT = Path(r"G:\dowloand\teste\phase6-failure-observability-20260911\pedro-01")


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    started = time.monotonic()
    info = probe(str(SOURCE))
    regions = json.loads(REGIONS.read_text(encoding="utf-8"))
    raw = EVIDENCE / "raw-masks"
    inference = EVIDENCE / "subtitle-policy" / "inference-masks"
    composite = EVIDENCE / "subtitle-policy" / "composite-masks"

    raw_outside_composite = 0
    composition_outside_inference = 0
    for index in range(info.frames):
        raw_mask = cv2.imread(str(raw / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
        inference_mask = cv2.imread(str(inference / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
        composite_mask = cv2.imread(str(composite / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
        if any(mask is None for mask in (raw_mask, inference_mask, composite_mask)):
            raise AssertionError(f"missing mask at frame {index}")
        raw_outside_composite += int(cv2.countNonZero(
            cv2.bitwise_and(raw_mask, cv2.bitwise_not(composite_mask))))
        composition_outside_inference += int(cv2.countNonZero(
            cv2.bitwise_and(composite_mask, cv2.bitwise_not(inference_mask))))

    source_region = prepare_inference_region(str(SOURCE), str(inference), str(OUTPUT / "source-roi"), info)
    engine_region = prepare_inference_region(str(ARCHIVED_ENGINE), str(inference), str(OUTPUT / "engine-roi"), info)
    if source_region.box != engine_region.box:
        raise AssertionError("source and archived engine produced different ROI")
    restored = restore_inference_region(engine_region.source_path, source_region, str(SOURCE),
                                        str(OUTPUT / "restored-native.mp4"), info)
    junction = refine_subtitle_scene(str(SOURCE), restored, str(raw), str(composite),
                                     str(OUTPUT / "subtitle-junctions"), info, regions)

    outside_changed = 0
    max_outside_delta = 0
    frames = 0
    streams = read_frames(str(SOURCE)), read_frames(str(OUTPUT / "subtitle-junctions" / "reference-master.mp4"))
    try:
        for index, (a, b) in enumerate(zip_longest(*streams)):
            if a is None or b is None:
                raise AssertionError("frame count mismatch")
            mask = cv2.imread(str(composite / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
            outside = mask == 0
            delta = np.abs(a.astype(np.int16) - b.astype(np.int16))
            outside_changed += int(np.count_nonzero(np.any(delta > 0, axis=2) & outside))
            max_outside_delta = max(max_outside_delta, int(delta[outside].max(initial=0)))
            frames += 1
    finally:
        for stream in streams:
            stream.close()
    result = {
        "classification": "LOCAL_POST_ENGINE_PATH_PASS" if frames == info.frames and outside_changed == 0 else "FAIL",
        "scope": "CPU-only; archived worker output used as engine-output surrogate; no neural inference",
        "source": str(SOURCE), "archived_engine_output": str(ARCHIVED_ENGINE),
        "roi_box": list(source_region.box), "roi_size": [source_region.width, source_region.height],
        "frames_expected": info.frames, "frames_observed": frames, "fps": info.fps,
        "detected_text_mask_pixels_outside_composition": raw_outside_composite,
        "composition_pixels_outside_inference": composition_outside_inference,
        "outside_mask_changed_pixels": outside_changed, "outside_mask_max_delta": max_outside_delta,
        "junction_report": junction, "seconds": time.monotonic() - started,
    }
    (OUTPUT / "local-postengine-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "junction_report"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
