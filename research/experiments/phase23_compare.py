"""Build frame-aligned motion comparators for Phase 2/3 review."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


def label(frame: np.ndarray, text: str) -> np.ndarray:
    result = frame.copy()
    cv2.rectangle(result, (0, 0), (result.shape[1], 54), (8, 8, 8), -1)
    cv2.putText(result, text, (16, 37), cv2.FONT_HERSHEY_SIMPLEX, .82,
                (245, 245, 245), 2, cv2.LINE_AA)
    return result


def encode(master: Path, delivery: Path) -> None:
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", str(master), "-an",
        "-c:v", "libx264", "-preset", "slow", "-crf", "12",
        "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
        "-color_trc", "bt709", "-movflags", "+faststart", str(delivery)
    ], check=True)


def build(paths: list[Path], labels: list[str], output: Path, starts: list[int],
          frames: int, crop: tuple[int, int, int, int] | None = None) -> dict:
    caps = [cv2.VideoCapture(str(path)) for path in paths]
    for cap, start in zip(caps, starts):
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    if crop:
        x0, y0, x1, y1 = crop
        cell_w, cell_h = x1 - x0, y1 - y0
    else:
        cell_w, cell_h = 540, 960
    master = output.with_suffix(".lossless.mkv")
    writer = cv2.VideoWriter(str(master), cv2.VideoWriter_fourcc(*"FFV1"), 30, (cell_w * 2, cell_h * 2))
    if not writer.isOpened():
        raise RuntimeError("FFV1 writer unavailable")
    written = 0
    try:
        for _ in range(frames):
            cells = []
            for cap, name in zip(caps, labels):
                ok, frame = cap.read()
                if not ok:
                    raise ValueError(f"video ended while reading {name} at output frame {written}")
                if crop:
                    frame = frame[y0:y1, x0:x1]
                else:
                    frame = cv2.resize(frame, (cell_w, cell_h), interpolation=cv2.INTER_AREA)
                cells.append(label(frame, name))
            writer.write(np.vstack((np.hstack(cells[:2]), np.hstack(cells[2:]))))
            written += 1
    finally:
        writer.release()
        for cap in caps:
            cap.release()
    encode(master, output)
    return {"output": str(output), "lossless_master": str(master), "frames": written,
            "fps": 30, "starts": starts, "labels": labels, "crop": crop}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    p.add_argument("--vmake", type=Path, default=Path("G:/dowloand/teste/VMAKE.IA.mp4"))
    p.add_argument("--best", type=Path, required=True)
    args = p.parse_args()
    out = args.root / "comparators"
    out.mkdir(parents=True, exist_ok=True)
    source = args.root / "phase2/input.mp4"
    baseline = args.root / "phase2/baseline-master.mp4"
    final_paths = [source, baseline, args.best, args.vmake]
    final_labels = ["SOURCE (contains subtitles)", "BASELINE V3", "BEST PHASE 3", "VMAKE reference only"]
    report = {"alignment": {
        "method": "global blurred normalized-luma match outside subtitle band",
        "source_baseline_best_start": 3, "vmake_start": 0, "offset": -3,
        "mean_cosine_distance": 0.0008606724441051483,
        "warning": "Vmake is perceptual reference, never donor or ground truth."
    }, "inputs": {"source": str(source), "baseline_v3": str(baseline),
                    "best_phase3": str(args.best), "vmake_reference": str(args.vmake)},
              "videos": []}
    report["videos"].append(build(final_paths, final_labels, out / "source-v3-best-vmake.mp4", [3, 3, 3, 0], 144))
    report["videos"].append(build(final_paths, final_labels, out / "source-v3-best-vmake-sweater.mp4", [3, 3, 3, 0], 144,
                                         crop=(180, 1340, 900, 1545)))
    cpaths = [args.root / "candidates/A4-safe-wide/master.mp4",
              args.root / "candidates/C1b-stride1/master.mp4",
              args.root / "candidates/C2-window43/master.mp4",
              args.root / "candidates/C3-neighbor10/master.mp4"]
    report["videos"].append(build(cpaths, ["A4 control", "C1 stride=1", "C2 window=43", "C3 neighbor=10"],
                                         out / "temporal-ablation-sweater.mp4", [104] * 4, 43,
                                         crop=(180, 1340, 900, 1545)))
    apaths = [args.root / "candidates/A0-current/master.mp4",
              args.root / "candidates/A1-precise/master.mp4",
              args.root / "candidates/A2-composite-mask/master.mp4",
              args.root / "candidates/A4-safe-wide/master.mp4"]
    report["videos"].append(build(apaths, ["A0 fixed band", "A1 precise", "A2 composite", "A4 safe wide"],
                                         out / "mask-ablation-sweater.mp4", [104] * 4, 43,
                                         crop=(180, 1340, 900, 1545)))
    (out / "comparison-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "videos": len(report["videos"])}))


if __name__ == "__main__":
    main()
