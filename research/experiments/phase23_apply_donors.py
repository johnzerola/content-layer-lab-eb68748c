"""Apply only accepted real source pixels from the donor audit to a master."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time

import cv2
import numpy as np

from phase23_color import COUNT, H, W, encode_delivery, rgb_writer

ROI = (130, 1240, 820, 410)


def sha(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-master", type=Path, required=True)
    parser.add_argument("--donors", type=Path, required=True)
    parser.add_argument("--variant", default="B1-real-donors")
    parser.add_argument("--root", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    args = parser.parse_args()
    started = time.perf_counter()
    target = args.root / "candidates" / args.variant
    target.mkdir(parents=True, exist_ok=False)
    composite = target / "composite"
    composite.mkdir()
    cap = cv2.VideoCapture(str(args.base_master))
    writer = rgb_writer(target / "master.mp4")
    x, y, width, height = ROI
    changes = []
    clipped_outside_total = 0
    try:
        assert writer.stdin is not None
        for index in range(COUNT):
            ok, frame = cap.read()
            if not ok or frame.shape != (H, W, 3):
                raise ValueError(f"base master incomplete at {index}")
            changed = 0
            if index >= 104:
                donor = cv2.imread(str(args.donors / "candidate" / f"{index:06d}.png"), cv2.IMREAD_COLOR)
                labels = cv2.imread(str(args.donors / "labels" / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
                if donor is None or donor.shape != (height, width, 3) or labels is None or labels.shape != (height, width):
                    raise ValueError(f"donor audit incomplete at {index}")
                accepted = labels == 1
                composition_mask = cv2.imread(str(args.root / "phase2" / "masks" / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
                if composition_mask is None or composition_mask.shape != (H, W):
                    raise ValueError(f"composition mask missing at {index}")
                authorized = composition_mask[y:y + height, x:x + width] > 0
                selected = accepted & authorized
                clipped_outside = int((accepted & ~authorized).sum())
                clipped_outside_total += clipped_outside
                roi = frame[y:y + height, x:x + width]
                roi[selected] = donor[selected]
                frame[y:y + height, x:x + width] = roi
                changed = int(selected.sum())
                if not cv2.imwrite(str(composite / f"{index:06d}.png"), frame):
                    raise IOError("failed to preserve donor composite")
            changes.append({"frame": index, "accepted_real_pixels": changed,
                            "accepted_but_clipped_outside_composition": clipped_outside if index >= 104 else 0})
            writer.stdin.write(np.ascontiguousarray(frame).tobytes())
        writer.stdin.close()
        if writer.wait() != 0:
            raise RuntimeError("master encoder failed")
    finally:
        cap.release()
        if writer.poll() is None:
            writer.kill()
    master = target / "master.mp4"
    delivery = target / "delivery-crf14.mp4"
    encoding = encode_delivery(master, Path("G:/dowloand/teste/resultado-automatico-v3-20260909/input.mp4"), delivery, 14)
    report = {"variant": args.variant, "status": "COMPLETED_CANDIDATE", "variable": "accepted real-source temporal donor pixels",
              "base_master": {"path": str(args.base_master), "sha256": sha(args.base_master)},
              "donor_audit": {"path": str(args.donors / "report.json"), "sha256": sha(args.donors / "report.json")},
              "roi_xywh": ROI, "frames": changes, "accepted_real_pixels": sum(row["accepted_real_pixels"] for row in changes),
              "accepted_but_clipped_outside_composition": clipped_outside_total,
              "master": {"path": str(master), "sha256": sha(master)}, "delivery": {"path": str(delivery), "sha256": sha(delivery), **encoding},
              "sharpening": False, "synthetic_texture_added": False, "cloud_gpu_cost_usd": 0,
              "seconds": round(time.perf_counter() - started, 3), "decision": "RETEST_MANUAL_MOTION"}
    (target / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"variant": args.variant, "accepted_real_pixels": report["accepted_real_pixels"], "seconds": report["seconds"]}))


if __name__ == "__main__":
    main()
