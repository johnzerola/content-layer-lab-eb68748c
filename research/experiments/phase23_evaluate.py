"""Evaluate Phase 3 masters with preservation gates and bounded proxies."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

COUNT, H, W = 147, 1920, 1080
FILM = (25, 540, 1055, 1660)
SWEATER = (226, 1370, 853, 1510)


def sha(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def descriptor(frame, box, selected=None):
    x0, y0, x1, y1 = box
    patch = frame[y0:y1, x0:x1]
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).astype(np.float32)
    high = gray - cv2.GaussianBlur(gray, (0, 0), 1.0)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0) / 8
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1) / 8
    use = np.ones(gray.shape, bool) if selected is None else selected[y0:y1, x0:x1]
    if not use.any():
        return None
    return {"high_frequency_rms": float(np.sqrt(np.mean(high[use] ** 2))),
            "gradient_rms": float(np.sqrt(np.mean((gx * gx + gy * gy)[use]))),
            "luma_mean": float(gray[use].mean()), "pixels": int(use.sum())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source_path = args.root / "phase2/input.mp4"
    baseline_path = args.root / "phase2/baseline-master.mp4"
    captures = [cv2.VideoCapture(str(path)) for path in (source_path, baseline_path, args.candidate)]
    mask_dir = args.root / "phase2/masks"
    rows = []
    totals = {"outside_changed": 0, "outside_max": 0, "green_residual_pixels": 0,
              "clean_frame_sse": 0.0, "clean_frame_samples": 0}
    baseline_prefix_equal = True
    temporal = []
    previous = None
    for index in range(COUNT):
        decoded = [capture.read() for capture in captures]
        if not all(ok and frame.shape == (H, W, 3) for ok, frame in decoded):
            raise ValueError(f"delivery contract failed at frame {index}")
        source, baseline, candidate = [frame for _, frame in decoded]
        mask = cv2.imread(str(mask_dir / f"{index:06d}.png"), 0) > 0
        delta_source = candidate.astype(np.int16) - source.astype(np.int16)
        outside = ~mask
        changed = int(np.any(delta_source[outside] != 0, axis=1).sum())
        maximum = int(np.abs(delta_source[outside]).max()) if outside.any() else 0
        totals["outside_changed"] += changed
        totals["outside_max"] = max(totals["outside_max"], maximum)
        b, g, r = [candidate[..., c].astype(np.int16) for c in range(3)]
        green = mask & (g - r > 18) & (g - b > 14) & (g > 45)
        residual = int(green.sum())
        totals["green_residual_pixels"] += residual
        if index in (145, 146):
            clean = mask & np.indices(mask.shape)[0].__ge__(1350) & np.indices(mask.shape)[0].__lt__(1540)
            diff = delta_source[clean].astype(np.float64)
            totals["clean_frame_sse"] += float(np.square(diff).sum())
            totals["clean_frame_samples"] += int(diff.size)
        if index >= 104:
            rows.append({"frame": index, "outside_changed_pixels": changed,
                         "outside_max_delta": maximum, "green_residual_pixels": residual,
                         "sweater": descriptor(candidate, SWEATER, mask),
                         "baseline_sweater": descriptor(baseline, SWEATER, mask)})
        if index < 104:
            baseline_prefix_equal &= bool(np.array_equal(candidate, baseline))
        if previous is not None and index >= 105:
            previous_candidate, previous_baseline, previous_mask = previous
            selected = previous_mask | mask
            dc = candidate.astype(np.float32) - previous_candidate.astype(np.float32)
            db = baseline.astype(np.float32) - previous_baseline.astype(np.float32)
            temporal.append({"frame": index - 1, "candidate_abs_change": float(np.abs(dc[selected]).mean()),
                             "baseline_abs_change": float(np.abs(db[selected]).mean()),
                             "delta_proxy": float(np.abs(dc[selected]).mean() - np.abs(db[selected]).mean())})
        if index >= 104:
            previous = (candidate.copy(), baseline.copy(), mask.copy())
    for capture in captures:
        extra, _ = capture.read()
        capture.release()
        if extra:
            raise ValueError("delivery has more than 147 frames")
    clean_mse = totals.pop("clean_frame_sse") / max(1, totals.pop("clean_frame_samples"))
    totals["clean_source_frames_145_146_mse_inside_archived_mask"] = clean_mse
    totals["clean_source_frames_145_146_psnr_db"] = 10 * np.log10(255 ** 2 / clean_mse) if clean_mse else None
    # Change in raw frame-to-frame differences is a temporal proxy only. It is
    # evaluated on the archived mask union and cannot distinguish motion/flicker.
    report = {"variant": args.variant, "candidate": str(args.candidate), "sha256": sha(args.candidate),
              "delivery_contract": {"width": W, "height": H, "frames": COUNT, "fps": 30},
              "preservation_and_residual": totals, "frames": rows, "temporal_difference_proxy": temporal,
              "regression_gates": {"frames_0_103_equal_phase2_baseline": baseline_prefix_equal,
                                   "outside_archived_masks_equal_source": totals["outside_changed"] == 0,
                                   "green_residual_zero": totals["green_residual_pixels"] == 0},
              "manual_review_required": ["dark/black glyph shadows", "flicker and ghosting in motion", "sweater texture continuity"],
              "limitations": ["SOURCE contains text inside most masks and is not reconstruction ground truth.",
                              "Frames145/146 are visually clean candidates, not independently annotated ground truth.",
                              "Raw frame difference is only a temporal proxy and does not compensate motion.",
                              "High-frequency metrics can reward noise and residual glyph edges."],
              "decision": "RETEST_MANUAL_MOTION"}
    out = args.output / f"{args.variant}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"report": str(out), "gates": report["regression_gates"], "metrics": totals}, allow_nan=False))


if __name__ == "__main__":
    main()
