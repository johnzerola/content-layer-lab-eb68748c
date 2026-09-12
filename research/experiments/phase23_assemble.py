"""Assemble one Phase 3 scene candidate without appearance enhancement."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time

import cv2
import numpy as np

from phase23_color import COUNT, H, W, encode_delivery, rgb_writer

ROI = (130, 1300, 820, 294)


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--raw-roi", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    args = parser.parse_args()
    started = time.perf_counter()
    target = args.root / "candidates" / args.variant
    target.mkdir(parents=True, exist_ok=False)
    composite_frames = target / "composite"
    composite_frames.mkdir()
    source_path = args.root / "phase2/input.mp4"
    baseline_path = args.root / "phase2/baseline-master.mp4"
    mask_dir = args.root / "phase2/masks"
    audio_path = Path("G:/dowloand/teste/resultado-automatico-v3-20260909/input.mp4")
    source = cv2.VideoCapture(str(source_path))
    baseline = cv2.VideoCapture(str(baseline_path))
    master = target / "master.mp4"
    writer = rgb_writer(master)
    exact_outside = True
    raw_hashes, mask_hashes = [], []
    x, y, width, height = ROI
    try:
        assert writer.stdin is not None
        for index in range(COUNT):
            ok_source, source_frame = source.read()
            ok_base, base_frame = baseline.read()
            if not ok_source or not ok_base or source_frame.shape != (H, W, 3) or base_frame.shape != (H, W, 3):
                raise ValueError(f"incomplete input at frame {index}")
            if index < 104:
                candidate = base_frame
            else:
                local = index - 104
                raw_path = args.raw_roi / f"{local:06d}.png"
                raw = cv2.imread(str(raw_path), cv2.IMREAD_COLOR)
                mask_path = mask_dir / f"{index:06d}.png"
                mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
                if raw is None or raw.shape != (height, width, 3):
                    raise ValueError(f"invalid raw ROI {raw_path}")
                if mask is None or mask.shape != (H, W):
                    raise ValueError(f"invalid composition mask {mask_path}")
                candidate = source_frame.copy()
                selected = mask[y:y + height, x:x + width] > 0
                roi = candidate[y:y + height, x:x + width]
                roi[selected] = raw[selected]
                candidate[y:y + height, x:x + width] = roi
                if not np.array_equal(candidate[mask == 0], source_frame[mask == 0]):
                    exact_outside = False
                if not cv2.imwrite(str(composite_frames / f"{index:06d}.png"), candidate):
                    raise IOError("failed to preserve composite PNG")
                raw_hashes.append({"frame": index, "sha256": digest(raw_path)})
                mask_hashes.append({"frame": index, "sha256": digest(mask_path), "pixels": int(selected.sum())})
            writer.stdin.write(np.ascontiguousarray(candidate).tobytes())
        writer.stdin.close()
        if writer.wait() != 0:
            raise RuntimeError("lossless master encoder failed")
    finally:
        source.release()
        baseline.release()
        if writer.poll() is None:
            writer.kill()
    delivery = target / "delivery-crf14.mp4"
    encoding = encode_delivery(master, audio_path, delivery, 14)
    report = {
        "variant": args.variant,
        "status": "COMPLETED_CANDIDATE",
        "variable": "ProPainter inference behavior supplied by raw-roi; composition mask and delivery fixed",
        "source": {"path": str(source_path), "sha256": digest(source_path)},
        "baseline": {"path": str(baseline_path), "sha256": digest(baseline_path)},
        "raw_roi_directory": str(args.raw_roi),
        "roi_xywh": ROI,
        "composition_mask_directory": str(mask_dir),
        "raw_hashes": raw_hashes,
        "mask_hashes": mask_hashes,
        "outside_mask_exact_in_master": exact_outside,
        "master": {"path": str(master), "sha256": digest(master)},
        "delivery": {"path": str(delivery), "sha256": digest(delivery), **encoding},
        "composite_png_directory": str(composite_frames),
        "sharpening": False,
        "cloud_gpu_cost_usd": 0,
        "seconds": round(time.perf_counter() - started, 3),
        "conclusion": "RETEST_PENDING_TEMPORAL_REVIEW",
    }
    (target / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"variant": args.variant, "master": str(master), "delivery": str(delivery), "seconds": report["seconds"]}))


if __name__ == "__main__":
    main()
