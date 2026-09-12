"""One short native-grid FP16 versus FP32 ProPainter control for Experiment 2."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

from experiment2_propainter_context import digest, sample_gpu


ROOT = Path(r"G:/dowloand/teste/experiment-2-temporal-context-20260911")
SOURCE = ROOT / "model/D2-context95"
RUNTIME = Path(r"G:/cleaneria-runtime/ProPainter")
PYTHON = Path(r"G:/cleaneria-runtime/propainter-env/Scripts/python.exe")
ENTRY = Path(__file__).with_name("phase23_model_entry.py").resolve()
START, COUNT = 8, 18  # source frames 112-129


def run_arm(name: str, fp16: bool):
    dest = ROOT / "model/precision-control" / name
    dest.mkdir(parents=True, exist_ok=False)
    input_dir, mask_dir = dest / "input", dest / "mask"
    input_dir.mkdir(); mask_dir.mkdir()
    for local in range(COUNT):
        source_local = START + local
        shutil.copy2(SOURCE / "input" / f"{source_local:06d}.png", input_dir / f"{local:06d}.png")
        shutil.copy2(SOURCE / "mask" / f"{source_local:06d}.png", mask_dir / f"{local:06d}.png")
    command = [str(PYTHON), str(ENTRY), "--video", str(input_dir), "--mask", str(mask_dir),
               "--output", str(dest / "run"), "--width", "824", "--height", "296",
               "--save_fps", "30", "--subvideo_length", "18", "--neighbor_length", "6",
               "--ref_stride", "2", "--mask_dilation", "2", "--save_frames"]
    if fp16:
        command.append("--fp16")
    environment = os.environ.copy(); environment["PHASE23_PROPAINTER_ROOT"] = str(RUNTIME)
    environment["PYTHONPATH"] = str(RUNTIME)
    samples, started = [], time.perf_counter()
    with (dest / "model.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, cwd=RUNTIME, env=environment, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 300
        while process.poll() is None:
            samples.append(sample_gpu())
            if time.monotonic() > deadline:
                process.kill(); process.wait(); break
            time.sleep(1)
    completed = process.returncode == 0
    report = {"name": name, "precision": "fp16" if fp16 else "fp32", "completed": completed,
              "returncode": process.returncode, "seconds": time.perf_counter() - started,
              "command": command, "source_frames_inclusive": [112, 129], "grid": [824, 296],
              "spatial_fallback": False, "gpu_samples": samples,
              "peak_sampled_vram_mib": max((row["memory_used_mib"] for row in samples
                                              if "memory_used_mib" in row), default=None),
              "log_sha256": digest(dest / "model.log")}
    (dest / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parent = ROOT / "model/precision-control"
    parent.mkdir(parents=True, exist_ok=False)
    reports = [run_arm("fp16", True), run_arm("fp32", False)]
    comparison = []
    if all(row["completed"] for row in reports):
        dirs = [parent / "fp16/run/input/frames", parent / "fp32/run/input/frames"]
        for local in range(COUNT):
            a = cv2.imread(str(dirs[0] / f"{local:04d}.png"), cv2.IMREAD_COLOR)
            b = cv2.imread(str(dirs[1] / f"{local:04d}.png"), cv2.IMREAD_COLOR)
            mask = cv2.imread(str(parent / "fp16/mask" / f"{local:06d}.png"), 0) > 0
            delta = np.abs(a.astype(np.float32) - b.astype(np.float32)).mean(axis=2)
            comparison.append({"source_frame": 112 + local,
                               "masked_mae_fp32_vs_fp16": float(delta[mask].mean()) if mask.any() else 0,
                               "masked_max_channel_delta": int(np.abs(a.astype(np.int16) - b.astype(np.int16))[mask].max()) if mask.any() else 0,
                               "outside_mask_mae": float(delta[~mask].mean())})
    result = {"experiment": "short FP16 versus FP32, one precision variable",
              "arms": reports, "comparison": comparison,
              "mean_masked_mae_fp32_vs_fp16": float(np.mean([r["masked_mae_fp32_vs_fp16"] for r in comparison])) if comparison else None,
              "decision_rule": "FP32 is relevant only if it creates a visible/metric reconstruction gain beyond numerical variance",
              "cloud_gpu_cost_usd": 0}
    (parent / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(parent / "report.json"), "arms": reports,
                      "mean_masked_mae": result["mean_masked_mae_fp32_vs_fp16"]}), flush=True)


if __name__ == "__main__":
    main()
