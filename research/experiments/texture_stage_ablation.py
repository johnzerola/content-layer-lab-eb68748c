"""Audit retained sweater-scene intermediates; no inference or production edits."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np


def sha256(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def frame(path, index):
    cap = cv2.VideoCapture(str(path))
    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, result = cap.read()
        if not ok:
            raise ValueError(f"Missing frame {index}: {path}")
        return result
    finally:
        cap.release()


def energy(image, selected):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    support = cv2.erode(selected.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    if not support.any():
        return None
    high = gray - cv2.GaussianBlur(gray, (0, 0), 1.0)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    return {"high_frequency_rms": float(np.sqrt(np.mean(high[support] ** 2))),
            "gradient_rms": float(np.sqrt(np.mean((gx*gx + gy*gy)[support]))),
            "sample_pixels": int(support.sum())}


def error(a, b, selected):
    delta = a.astype(np.int16)[selected] - b.astype(np.int16)[selected]
    return {"mae": float(np.abs(delta).mean()), "max_delta": int(np.abs(delta).max()),
            "changed_pixels": int(np.any(delta != 0, axis=1).sum())} if delta.size else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("G:/dowloand/teste"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    old = args.root / "resultado-automatico-v2-20260909/scenes/0002"
    phase = args.root / "resultado-fase1-preservacao-b-20260910"
    paths = {
        "source": old / "input.mp4",
        "v3_roi": old / "inference_region_0fd71f2h/input.mp4",
        "v3_raw_encoded": old / "propainter-run/input/inpaint_out.mp4",
        "v3_restored": old / "propainter-native.mp4",
        "v3_final": old / "output.mp4",
        "p1_roi": phase / "scenes/0002/inference_region_ay8167ek/input.mp4",
        "p1_raw_lossless": phase / "scenes/0002/propainter-run/inpaint-lossless.mp4",
        "p1_restored": phase / "scenes/0002/native.mp4",
        "p1_master": phase / "scenes/0002/master.mp4",
        "p1_crf14": phase / "output-crf14.mp4",
        "p1_crf12": phase / "output-crf12.mp4",
    }
    records = []
    for index in [2, 11, 16, 26, 36]:
        imgs = {name: frame(path, index + (104 if name in {"p1_crf14", "p1_crf12"} else 0)) for name, path in paths.items()}
        mask_path = old / f"subtitle-policy/composite-masks/{index:06d}.png"
        mask = cv2.imread(str(mask_path), 0)
        if mask is None:
            raise ValueError(f"Missing mask: {mask_path}")
        mask = mask[1300:1594, 130:950] == 255
        roi = {name: value[1300:1594, 130:950] if value.shape[:2] == (1920, 1080) else value for name, value in imgs.items()}
        old_raw = roi["v3_raw_encoded"]
        # Only this diagnostic derivative is resized; all other measurements use native pixels.
        roi["v3_raw_restoration_expected"] = cv2.resize(old_raw, (820, 294), interpolation=cv2.INTER_LANCZOS4)
        measurements = {name: {"inside_mask": energy(img, mask), "outside_mask_in_roi": energy(img, ~mask)}
                        for name, img in roi.items() if img.shape[:2] == (294, 820)}
        record = {"source_frame": index+104, "scene_frame": index, "metrics": measurements,
                  "checks": {
                      "v3_crop_vs_source": error(roi["source"], roi["v3_roi"], np.ones_like(mask)),
                      "p1_crop_vs_source": error(roi["source"], roi["p1_roi"], np.ones_like(mask)),
                      "v3_restore_vs_expected_lanczos": error(roi["v3_raw_restoration_expected"], roi["v3_restored"], np.ones_like(mask)),
                      "p1_restore_vs_raw": error(roi["p1_raw_lossless"], roi["p1_restored"], np.ones_like(mask)),
                      "p1_composite_vs_raw_inside": error(roi["p1_master"], roi["p1_raw_lossless"], mask),
                      "p1_composite_vs_source_outside": error(roi["p1_master"], roi["source"], ~mask),
                      "p1_encode14_vs_master_inside": error(roi["p1_crf14"], roi["p1_master"], mask),
                      "p1_encode12_vs_master_inside": error(roi["p1_crf12"], roi["p1_master"], mask),
                  }}
        records.append(record)
        if index == 16:
            labels = [("V3 raw -> Lanczos (diagnostic)", "v3_raw_restoration_expected"),
                      ("V3 restored ROI", "v3_restored"), ("V3 final", "v3_final"),
                      ("Phase1 raw, native grid", "p1_raw_lossless"),
                      ("Phase1 master before encode", "p1_master"), ("Phase1 CRF14", "p1_crf14")]
            canvas = np.full((3*336, 2*820, 3), 24, np.uint8)
            for i, (label, key) in enumerate(labels):
                y, x = (i//2)*336, (i%2)*820
                cv2.putText(canvas, label, (x+12, y+28), cv2.FONT_HERSHEY_SIMPLEX, .65, (255,255,255), 1, cv2.LINE_AA)
                canvas[y+42:y+336, x:x+820] = roi[key]
            cv2.imwrite(str(args.output / "etapas-sueter-frame120.png"), canvas)
    report = {"kind": "retained_intermediate_stage_ablation", "scene": 2, "source_range": [104,147],
              "sources": {k: {"path": str(p), "sha256": sha256(p)} for k,p in paths.items()},
              "records": records, "limitations": [
                  "V3 raw means encoded upstream MP4, not pre-encode neural tensor; V3 tensor/PNG unavailable.",
                  "Inside mask original contains subtitle; no reconstruction truth metrics against it.",
                  "Five selected frames in one scene are diagnostics, not independent cases or temporal quality validation.",
                  "V3 resampling stage checked against an explicitly resized derivative; raw native grid differs.",
                  "No new inference or paid GPU job." ]}
    out = args.output / "stage-ablation.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"report": str(out), "records": len(records), "frame120": records[2]}, indent=2))


if __name__ == "__main__":
    main()
