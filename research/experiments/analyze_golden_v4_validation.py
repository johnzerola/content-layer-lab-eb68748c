"""Create deterministic evidence for the Golden V4 real-clip validation."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def frames(path: Path):
    capture = cv2.VideoCapture(str(path))
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            yield frame
    finally:
        capture.release()


def selection_mask(height: int, width: int, regions: list[dict]) -> np.ndarray:
    mask = np.zeros((height, width), np.uint8)
    for region in regions:
        grow = float(region["grow"])
        x0 = max(0, round((float(region["x"]) - grow) * width))
        y0 = max(0, round((float(region["y"]) - grow) * height))
        x1 = min(width, round((float(region["x"]) + float(region["w"]) + grow) * width))
        y1 = min(height, round((float(region["y"]) + float(region["h"]) + grow) * height))
        mask[y0:y1, x0:x1] = 255
    return mask


def audio_hash(path: Path) -> str:
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0",
               "-c", "copy", "-f", "hash", "-hash", "sha256", "-"]
    return subprocess.check_output(command, text=True).strip().split("=", 1)[1].lower()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--delivery", type=Path, required=True)
    parser.add_argument("--regions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = args.output / "critical-frames"
    evidence.mkdir(exist_ok=True)
    regions = json.loads(args.regions.read_text(encoding="utf-8"))
    source_frames = list(frames(args.source))
    master_frames = list(frames(args.master))
    delivery_frames = list(frames(args.delivery))
    if not (len(source_frames) == len(master_frames) == len(delivery_frames) == 147):
        raise RuntimeError("frame contract failed")
    height, width = source_frames[0].shape[:2]
    mask = selection_mask(height, width, regions)
    outside = mask == 0
    changed = max_delta = absolute_sum = samples = 0
    green_pixels = green_frames = 0
    temporal_ratios = []
    for index, (source, master, delivery) in enumerate(zip(source_frames, master_frames, delivery_frames)):
        delta = cv2.absdiff(source, master)
        outside_delta = delta[outside]
        changed += int(np.count_nonzero(np.any(delta[outside] != 0, axis=1)))
        max_delta = max(max_delta, int(outside_delta.max(initial=0)))
        absolute_sum += int(outside_delta.astype(np.uint64).sum())
        samples += int(outside_delta.size)
        b, g, r = cv2.split(delivery)
        green = (g > 105) & (g > r * 1.12) & (g > b * 1.08) & (mask > 0)
        count = int(np.count_nonzero(green))
        green_pixels += count
        green_frames += int(count > 0)
        if index:
            src_motion = float(cv2.absdiff(source_frames[index - 1], source)[mask > 0].mean())
            out_motion = float(cv2.absdiff(delivery_frames[index - 1], delivery)[mask > 0].mean())
            if src_motion > 0.5:
                temporal_ratios.append(out_motion / src_motion)
    for index in (0, 34, 60, 88, 120, 145):
        source = source_frames[index]
        output = delivery_frames[index]
        x0, x1 = 180, 900
        y0, y1 = 1320, 1840
        crop_source = source[y0:y1, x0:x1]
        crop_output = output[y0:y1, x0:x1]
        top = np.hstack((cv2.resize(source, (405, 720)), cv2.resize(output, (405, 720))))
        bottom = np.hstack((cv2.resize(crop_source, (405, 292)), cv2.resize(crop_output, (405, 292))))
        sheet = np.vstack((top, bottom))
        cv2.putText(sheet, "INPUT", (12, 32), cv2.FONT_HERSHEY_SIMPLEX, .8, (255,255,255), 2)
        cv2.putText(sheet, "CLEANER_GOLDEN_V4", (420, 32), cv2.FONT_HERSHEY_SIMPLEX, .8, (255,255,255), 2)
        cv2.imwrite(str(evidence / f"frame-{index:03d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94])
    source_audio = audio_hash(args.source)
    delivery_audio = audio_hash(args.delivery)
    metrics = {
        "schema": "cleaner-golden-v4-final-validation-v1",
        "files": {name: {"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size}
                  for name, path in (("source", args.source), ("master", args.master), ("delivery", args.delivery))},
        "contract": {"width": width, "height": height, "fps": "30/1", "frames": 147, "duration": 4.9},
        "outside_frozen_selection_master": {
            "altered_pixels": changed, "max_channel_delta": max_delta,
            "mae": absolute_sum / samples if samples else None,
        },
        "neon_green_descriptor_delivery": {"pixels": green_pixels, "frames_affected": green_frames,
            "limitation": "descriptive color detector; not OCR or ground truth"},
        "temporal_motion_ratio_inside_selection": {
            "median": float(np.median(temporal_ratios)),
            "p95": float(np.percentile(temporal_ratios, 95)),
            "limitation": "adjacent-frame motion descriptor; human review remains required",
        },
        "audio": {"source_packet_hash": source_audio, "delivery_packet_hash": delivery_audio,
                  "stream_copy_exact": source_audio == delivery_audio},
    }
    (args.output / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
