"""Evaluate Phase 4 finish variants against B2 without using Vmake as GT."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

COUNT, H, W = 147, 1920, 1080
SWEATER = (226, 1370, 853, 1510)
FILM = (25, 540, 1055, 1660)


def energy(frame: np.ndarray, selected: np.ndarray) -> tuple[float, float, float]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = gray - cv2.GaussianBlur(gray, (0, 0), 1.0)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0) / 8
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1) / 8
    return (float(np.sqrt(np.mean(hp[selected] ** 2))),
            float(np.sqrt(np.mean((gx[selected] ** 2 + gy[selected] ** 2)))),
            float(gray[selected].mean()))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--phase23", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    p.add_argument("--phase4", type=Path, default=Path("G:/dowloand/teste/phase-4-v3-20260910"))
    args = p.parse_args()
    paths = {
        "base": args.phase23 / "candidates/B2-real-donors-clipped-C2/master.mp4",
        "current": args.phase4 / "current/master.mp4",
        "luma-local": args.phase4 / "luma-local/master.mp4",
        "film-optional": args.phase4 / "film-optional/master.mp4",
    }
    caps = {name: cv2.VideoCapture(str(path)) for name, path in paths.items()}
    totals = {name: {"changed": 0, "outside_mask": 0, "outside_film": 0,
                     "previous_scenes": 0, "clean_frames": 0, "max_delta": 0,
                     "hf": [], "gradient": [], "luma": [], "temporal_delta": []}
              for name in paths if name != "base"}
    base_metrics = {"hf": [], "gradient": [], "luma": []}
    previous = None
    for index in range(COUNT):
        decoded = {name: cap.read() for name, cap in caps.items()}
        if not all(ok and frame.shape == (H, W, 3) for ok, frame in decoded.values()):
            raise ValueError(f"video contract failed at {index}")
        frames = {name: value[1] for name, value in decoded.items()}
        mask = cv2.imread(str(args.phase23 / "phase2/masks" / f"{index:06d}.png"), 0) > 0
        if index >= 104:
            safe = cv2.imread(str(args.phase23 / "masks/native-safe-wide" / f"{index - 104:06d}.png"), 0) > 0
            mask &= safe
        film = np.zeros((H, W), bool)
        x0, y0, x1, y1 = FILM
        film[y0:y1, x0:x1] = True
        if index >= 104 and mask.any():
            bx0, by0, bx1, by1 = SWEATER
            selected = mask.copy()
            crop_gate = np.zeros_like(selected)
            crop_gate[by0:by1, bx0:bx1] = True
            selected &= crop_gate
            if selected.any():
                b = energy(frames["base"], selected)
                for key, val in zip(("hf", "gradient", "luma"), b):
                    base_metrics[key].append(val)
                for name in totals:
                    values = energy(frames[name], selected)
                    for key, val in zip(("hf", "gradient", "luma"), values):
                        totals[name][key].append(val)
        for name in totals:
            delta = np.abs(frames[name].astype(np.int16) - frames["base"].astype(np.int16))
            changed = np.any(delta > 0, axis=2)
            totals[name]["changed"] += int(changed.sum())
            totals[name]["outside_mask"] += int((changed & ~mask).sum())
            totals[name]["outside_film"] += int((changed & ~film).sum())
            totals[name]["previous_scenes"] += int(changed.sum()) if index < 104 else 0
            totals[name]["clean_frames"] += int(changed.sum()) if index in (145, 146) else 0
            totals[name]["max_delta"] = max(totals[name]["max_delta"], int(delta.max()))
        if previous is not None and index >= 105:
            union = previous["mask"] | mask
            if union.any():
                base_change = np.abs(frames["base"].astype(np.float32) - previous["base"].astype(np.float32))[union].mean()
                for name in totals:
                    candidate_change = np.abs(frames[name].astype(np.float32) - previous[name].astype(np.float32))[union].mean()
                    totals[name]["temporal_delta"].append(float(candidate_change - base_change))
        previous = {"mask": mask, **{name: frame.copy() for name, frame in frames.items()}}
    for cap in caps.values():
        extra, _ = cap.read()
        cap.release()
        if extra:
            raise ValueError("video has extra frames")

    summary = {"base_sweater": {k: float(np.mean(v)) for k, v in base_metrics.items()}, "variants": {}}
    for name, values in totals.items():
        row = {k: v for k, v in values.items() if not isinstance(v, list)}
        row["sweater"] = {k: float(np.mean(values[k])) for k in ("hf", "gradient", "luma")}
        td = values["temporal_delta"]
        row["temporal_proxy"] = {"mean_delta_vs_base": float(np.mean(td)),
                                 "mean_abs_delta_vs_base": float(np.mean(np.abs(td))),
                                 "max_abs_delta_vs_base": float(np.max(np.abs(td)))}
        if name == "current":
            decision = "REJECT_NO_EFFECT" if row["changed"] == 0 else "RETEST"
        elif name == "luma-local":
            decision = "RETEST_MOTION" if row["outside_mask"] == 0 and row["clean_frames"] == 0 else "REJECT_GATE"
        else:
            decision = "OPTIONAL_ONLY_REJECT_AS_RECONSTRUCTION"
        row["decision"] = decision
        summary["variants"][name] = row
    summary["limits"] = [
        "High-frequency and gradient energy can reward noise and are descriptors, not quality scores.",
        "SOURCE contains subtitles inside the mask and cannot score reconstructed pixels.",
        "Vmake is excluded from numerical acceptance and remains a perceptual reference only.",
    ]
    (args.phase4 / "evaluation.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
