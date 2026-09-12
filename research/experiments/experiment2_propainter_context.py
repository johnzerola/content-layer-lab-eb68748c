"""Experiment 2B: ProPainter with the same targets and scene context through 198.

Only temporal availability changes. Target frames 104-146 are copied byte for
byte from C2. New context frames use the same native ROI and the same wide-mask
rule. There are no OOM retries and no spatial fallback.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np


TARGET_COUNT = 43
TOTAL_COUNT = 95
SOURCE_START = 104
MODEL_SIZE = (824, 296)
ROI_SIZE = (820, 294)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(dest: Path, phase_root: Path, donor_root: Path):
    input_dir, mask_dir = dest / "input", dest / "mask"
    input_dir.mkdir(parents=True, exist_ok=False)
    mask_dir.mkdir(parents=True, exist_ok=False)
    old_input = phase_root / "model/C2-window43/input"
    old_mask = phase_root / "model/C2-window43/mask"
    rows = []
    wide_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    for local in range(TOTAL_COUNT):
        source_frame = SOURCE_START + local
        out_image, out_mask = input_dir / f"{local:06d}.png", mask_dir / f"{local:06d}.png"
        if local < TARGET_COUNT:
            shutil.copy2(old_input / f"{local:06d}.png", out_image)
            shutil.copy2(old_mask / f"{local:06d}.png", out_mask)
            role = "target_exact_C2_copy"
        else:
            crop = cv2.imread(str(donor_root / "source-crop" / f"{source_frame:06d}.png"), cv2.IMREAD_COLOR)
            precise = cv2.imread(str(donor_root / "source-masks" / f"{source_frame:06d}.png"), cv2.IMREAD_GRAYSCALE)
            if crop is None or crop.shape != (410, 820, 3) or precise is None or precise.shape != (410, 820):
                raise ValueError(f"bad context frame {source_frame}")
            image = crop[60:354]
            wide = cv2.dilate(precise, wide_kernel) if np.any(precise) else precise
            mask = wide[60:354]
            image = cv2.copyMakeBorder(image, 0, 2, 0, 4, cv2.BORDER_REPLICATE)
            mask = cv2.copyMakeBorder(mask, 0, 2, 0, 4, cv2.BORDER_REPLICATE)
            if not cv2.imwrite(str(out_image), image) or not cv2.imwrite(str(out_mask), mask):
                raise IOError(f"could not write context {source_frame}")
            role = "new_same_scene_context"
        image = cv2.imread(str(out_image)); mask = cv2.imread(str(out_mask), 0)
        if image.shape != (296, 824, 3) or mask.shape != (296, 824):
            raise ValueError(f"grid changed at {source_frame}")
        rows.append({"local_frame": local, "source_frame": source_frame, "role": role,
                     "input_sha256": digest(out_image), "mask_sha256": digest(out_mask),
                     "mask_pixels": int((mask > 0).sum())})
    # Prove the target bytes and masks are unchanged from C2.
    for local in range(TARGET_COUNT):
        if digest(input_dir / f"{local:06d}.png") != digest(old_input / f"{local:06d}.png"):
            raise AssertionError(f"target input changed at {local}")
        if digest(mask_dir / f"{local:06d}.png") != digest(old_mask / f"{local:06d}.png"):
            raise AssertionError(f"target mask changed at {local}")
    return input_dir, mask_dir, rows


def sample_gpu():
    command = ["nvidia-smi", "--query-gpu=timestamp,memory.used,memory.total,utilization.gpu",
               "--format=csv,noheader,nounits"]
    try:
        line = subprocess.check_output(command, text=True, timeout=5).strip()
        timestamp, used, total, utilization = [part.strip() for part in line.split(",")]
        return {"timestamp": timestamp, "memory_used_mib": int(used),
                "memory_total_mib": int(total), "utilization_percent": int(utilization)}
    except Exception as error:
        return {"error": str(error)}


def raw_prediction_inventory(raw_dir: Path):
    rows = []
    for path in sorted(raw_dir.glob("window-*.npz")):
        data = np.load(path)
        rows.append({"file": path.name, "center": int(np.asarray(data["center"])),
                     "neighbor_ids": data["neighbor_ids"].astype(int).tolist(),
                     "ref_ids": data["ref_ids"].astype(int).tolist(),
                     "prediction_shape": list(data["pred_img"].shape),
                     "sha256": digest(path)})
    return rows


def compare_targets(dest: Path, phase_root: Path):
    c2_dir = phase_root / "model/C2-window43/raw-output"
    d2_dir = dest / "raw-output"
    mask_dir = phase_root / "model/C2-window43/mask"
    rows = []
    for local in range(TARGET_COUNT):
        old = cv2.imread(str(c2_dir / f"{local:06d}.png"), cv2.IMREAD_COLOR)
        new = cv2.imread(str(d2_dir / f"{local:06d}.png"), cv2.IMREAD_COLOR)
        mask = cv2.imread(str(mask_dir / f"{local:06d}.png"), cv2.IMREAD_GRAYSCALE)[:294, :820] > 0
        difference = np.abs(new.astype(np.float32) - old.astype(np.float32)).mean(axis=2)
        gray_old = cv2.cvtColor(old, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gray_new = cv2.cvtColor(new, cv2.COLOR_BGR2GRAY).astype(np.float32)
        hp_old = gray_old - cv2.GaussianBlur(gray_old, (0, 0), 1.2)
        hp_new = gray_new - cv2.GaussianBlur(gray_new, (0, 0), 1.2)
        rows.append({"source_frame": local + SOURCE_START, "mask_pixels": int(mask.sum()),
                     "masked_mae_D2_vs_C2": float(difference[mask].mean()) if mask.any() else 0,
                     "outside_mask_max_D2_vs_C2": float(difference[~mask].max()) if (~mask).any() else 0,
                     "masked_texture_rms_C2": float(np.sqrt(np.mean(hp_old[mask] ** 2))) if mask.any() else None,
                     "masked_texture_rms_D2": float(np.sqrt(np.mean(hp_new[mask] ** 2))) if mask.any() else None})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(r"G:/dowloand/teste/experiment-2-temporal-context-20260911/model/D2-context95"))
    parser.add_argument("--phase-root", type=Path, default=Path(r"G:/dowloand/teste/phase-2-3-20260910"))
    parser.add_argument("--donor-root", type=Path, default=Path(r"G:/dowloand/teste/phase-2-3-20260910/donors/primary"))
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    started = time.perf_counter(); args.output.mkdir(parents=True, exist_ok=False)
    input_dir, mask_dir, inputs = prepare(args.output, args.phase_root, args.donor_root)
    runtime = Path(r"G:/cleaneria-runtime/ProPainter")
    python = Path(r"G:/cleaneria-runtime/propainter-env/Scripts/python.exe")
    entry = Path(__file__).with_name("phase23_model_entry.py").resolve()
    command = [str(python), str(entry), "--video", str(input_dir), "--mask", str(mask_dir),
               "--output", str(args.output / "run"), "--width", "824", "--height", "296",
               "--save_fps", "30", "--subvideo_length", "43", "--neighbor_length", "6",
               "--ref_stride", "2", "--mask_dilation", "2", "--fp16", "--save_frames"]
    environment = os.environ.copy(); environment["PHASE23_PROPAINTER_ROOT"] = str(runtime)
    environment["PYTHONPATH"] = str(runtime)
    report = {"experiment": "2B ProPainter temporal availability only", "status": "RUNNING",
              "source_frames_inclusive": [104, 198], "target_frames_inclusive": [104, 146],
              "only_variable_changed": "input sequence extends from 43 to 95 frames in the same scene",
              "target_inputs_and_masks_byte_exact_C2": True, "grid": [824, 296], "resampled": False,
              "precision": "fp16", "subvideo_length": 43, "neighbor_length_argument": 6,
              "neighbor_stride_effective": 3, "ref_stride": 2, "mask_dilation": 2,
              "donor_blending": False, "finish": False, "sharpening": False,
              "command": command, "runner_sha256": digest(runtime / "inference_propainter.py"),
              "entry_sha256": digest(entry), "inputs": inputs, "gpu_samples": [],
              "cloud_gpu_cost_usd": 0, "oom_resolution_retry": False}
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    log_path = args.output / "model.log"
    deadline = time.monotonic() + args.timeout
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, cwd=runtime, env=environment, stdout=log, stderr=subprocess.STDOUT)
        while process.poll() is None:
            report["gpu_samples"].append(sample_gpu())
            if time.monotonic() > deadline:
                process.kill(); process.wait()
                report.update(status="FAILED_TIMEOUT", error=f"exceeded {args.timeout}s; no retry")
                break
            time.sleep(1)
    if report["status"] == "RUNNING":
        if process.returncode != 0:
            report.update(status="FAILED", error=f"runner exit {process.returncode}; no retry")
        else:
            frames_dir = args.output / "run/input/frames"
            raw_output = args.output / "raw-output"; raw_output.mkdir()
            for local in range(TARGET_COUNT):
                frame = cv2.imread(str(frames_dir / f"{local:04d}.png"), cv2.IMREAD_COLOR)
                if frame is None or frame.shape != (296, 824, 3):
                    raise ValueError(f"missing model output {local}")
                cv2.imwrite(str(raw_output / f"{local:06d}.png"), frame[:294, :820])
            predictions = raw_prediction_inventory(args.output / "run/raw_predictions")
            comparison = compare_targets(args.output, args.phase_root)
            used = [sample["memory_used_mib"] for sample in report["gpu_samples"] if "memory_used_mib" in sample]
            report.update(status="COMPLETED", output_frames_total=len(list(frames_dir.glob("*.png"))),
                          output_target_frames=TARGET_COUNT, raw_prediction_windows=predictions,
                          target_comparison_to_C2=comparison,
                          peak_sampled_vram_mib=max(used) if used else None)
    report["seconds"] = time.perf_counter() - started
    report["model_log_sha256"] = digest(log_path)
    report["attempt_within_15_minute_cap"] = report["seconds"] <= args.timeout + 30
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"], "seconds": report["seconds"],
                      "peak_vram_mib": report.get("peak_sampled_vram_mib"),
                      "report": str(args.output / "report.json")}), flush=True)
    if report["status"] != "COMPLETED":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
