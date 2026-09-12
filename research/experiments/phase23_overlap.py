"""Recombine saved ProPainter window predictions without another GPU run.

The upstream runner recursively blends every repeated prediction 50/50, which
weights later windows more heavily.  This ablation keeps every inference input
fixed and changes only the overlap reducer (equal mean or per-channel median).
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model-run", required=True, type=Path)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--method", required=True, choices=("equal-mean", "median"))
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    predictions: dict[int, list[np.ndarray]] = defaultdict(list)
    masks: dict[int, list[np.ndarray]] = defaultdict(list)
    provenance: dict[int, list[str]] = defaultdict(list)
    for path in sorted((args.model_run / "raw_predictions").glob("*.npz")):
        with np.load(path) as data:
            pred = data["pred_img"]
            ids = data["neighbor_ids"]
            binary = data["binary_masks"]
            for local, frame_id in enumerate(ids.tolist()):
                # Match upstream quantization before overlap accumulation.
                predictions[int(frame_id)].append(pred[local].astype(np.uint8))
                masks[int(frame_id)].append(binary[local].astype(bool))
                provenance[int(frame_id)].append(path.name)

    rows = []
    for frame_id in range(43):
        original_bgr = cv2.imread(str(args.input / f"{frame_id:06d}.png"))
        if original_bgr is None:
            raise ValueError(f"missing input frame {frame_id}")
        original = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2RGB)
        if frame_id not in predictions:
            raise ValueError(f"no prediction for frame {frame_id}")
        images = []
        for pred, mask in zip(predictions[frame_id], masks[frame_id]):
            images.append(np.where(mask, pred, original))
        stack = np.stack(images).astype(np.float32)
        if args.method == "equal-mean":
            combined = np.rint(stack.mean(axis=0)).clip(0, 255).astype(np.uint8)
        else:
            combined = np.rint(np.median(stack, axis=0)).clip(0, 255).astype(np.uint8)
        union = np.any(np.stack(masks[frame_id]), axis=0)[..., 0]
        dispersion = np.std(stack, axis=0).mean(axis=2)
        rows.append({
            "frame": frame_id + 104,
            "prediction_count": len(images),
            "windows": provenance[frame_id],
            "masked_mean_prediction_std_rgb": float(dispersion[union].mean()) if union.any() else 0.0,
            "masked_p95_prediction_std_rgb": float(np.percentile(dispersion[union], 95)) if union.any() else 0.0,
        })
        # phase23_model.py removes the four-column/two-row alignment pad before
        # exposing raw output to the native ROI assembler.
        combined = combined[:294, :820]
        cv2.imwrite(str(args.output / f"{frame_id:06d}.png"), cv2.cvtColor(combined, cv2.COLOR_RGB2BGR))

    report = {
        "method": args.method,
        "variable": "overlap prediction reducer only",
        "source_predictions": str(args.model_run / "raw_predictions"),
        "frames": rows,
        "mean_predictions_per_frame": float(np.mean([r["prediction_count"] for r in rows])),
        "mean_masked_prediction_std_rgb": float(np.mean([r["masked_mean_prediction_std_rgb"] for r in rows])),
        "note": "Vmake was not read. No inference, restoration, sharpening, or synthesis was added.",
    }
    (args.output / "overlap-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("method", "mean_predictions_per_frame", "mean_masked_prediction_std_rgb")}))


if __name__ == "__main__":
    main()
