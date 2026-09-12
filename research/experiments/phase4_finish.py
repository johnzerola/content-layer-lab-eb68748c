"""Controlled Phase 4 finishing ablations over the Phase 3 B2 master.

No commercial-reference pixels, neural model, generated grain, resize, or paid
GPU are used.  Reconstruction finishing is limited to archived composition
masks in the sweater scene.  The film-area variant is explicitly optional and
is never treated as evidence that reconstruction improved.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve()
ROOT_REPO = HERE.parents[2]
sys.path.insert(0, str(ROOT_REPO / "backend"))

from app.video.subtitle_finish import FinishState, finish_frame  # noqa: E402
from phase23_color import COUNT, H, W, encode_delivery, rgb_writer  # noqa: E402

FILM = (25, 540, 1055, 1660)
SCENE_START = 104


def luma_unsharp(frame: np.ndarray, selected: np.ndarray, *, amount: float,
                 cap_y: float, sigma: float = 0.8) -> tuple[np.ndarray, dict]:
    """Sharpen Y only and preserve pixels outside ``selected`` byte-exactly."""
    result = frame.copy()
    if not selected.any() or amount <= 0:
        return result, {"changed_pixels": 0, "max_channel_delta": 0, "max_y_delta": 0}
    ycc = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    y = ycc[..., 0].astype(np.float32)
    high = y - cv2.GaussianBlur(y, (0, 0), sigma)
    dy = np.clip(high * amount, -cap_y, cap_y)
    changed_y = np.clip(np.rint(y + dy), 0, 255).astype(np.uint8)
    adjusted_ycc = ycc.copy()
    adjusted_ycc[..., 0] = changed_y
    adjusted = cv2.cvtColor(adjusted_ycc, cv2.COLOR_YCrCb2BGR)
    result[selected] = adjusted[selected]
    delta = np.abs(result.astype(np.int16) - frame.astype(np.int16))
    return result, {
        "changed_pixels": int(np.count_nonzero(np.any(delta > 0, axis=2) & selected)),
        "max_channel_delta": int(delta[selected].max()) if selected.any() else 0,
        "max_y_delta": int(np.max(np.abs(changed_y[selected].astype(np.int16) - ycc[..., 0][selected].astype(np.int16)))),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, default=Path("G:/dowloand/teste/phase-2-3-20260910"))
    p.add_argument("--output", type=Path, default=Path("G:/dowloand/teste/phase-4-v3-20260910"))
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    source_path = args.root / "phase2/input.mp4"
    base_path = args.root / "candidates/B2-real-donors-clipped-C2/master.mp4"
    mask_dir = args.root / "phase2/masks"
    safe_mask_dir = args.root / "masks/native-safe-wide"
    audio_path = Path("G:/dowloand/teste/padro-01-001 (15).mp4")
    variants = {
        "current": {"description": "existing finish_frame, strength 0.3, archived masks only"},
        "luma-local": {"description": "fixed Y-only unsharp 0.10, sigma 0.8, cap Y +/-2, eroded mask only"},
        "film-optional": {"description": "optional film rectangle Y-only unsharp 0.04, cap Y +/-1"},
    }
    for name in variants:
        (args.output / name / "change-maps").mkdir(parents=True, exist_ok=True)
    writers = {name: rgb_writer(args.output / name / "master.mp4") for name in variants}
    caps = [cv2.VideoCapture(str(source_path)), cv2.VideoCapture(str(base_path))]
    state = FinishState()
    frame_reports = {name: [] for name in variants}
    started = time.perf_counter()
    try:
        for index in range(COUNT):
            decoded = [cap.read() for cap in caps]
            if not all(ok and frame.shape == (H, W, 3) for ok, frame in decoded):
                raise ValueError(f"input/master incomplete at frame {index}")
            source, base = [frame for _, frame in decoded]
            mask = cv2.imread(str(mask_dir / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
            if mask is None or mask.shape != (H, W):
                raise ValueError(f"mask missing at frame {index}")
            active = mask > 0
            # Frames 104..146 have the authoritative safe-wide inference mask.
            # Its empty frames must remain untouched even when an older archived
            # composition mask still contains stale support.
            if index >= SCENE_START:
                safe = cv2.imread(str(safe_mask_dir / f"{index - SCENE_START:06d}.png"), cv2.IMREAD_GRAYSCALE)
                if safe is None or safe.shape != (H, W):
                    raise ValueError(f"safe mask missing at frame {index}")
                active &= safe > 0
                mask = active.astype(np.uint8) * 255
            if index == SCENE_START:
                state.reset()

            # Current product finish is measured only on the target sweater
            # scene, so earlier approved regions cannot regress.
            if index >= SCENE_START:
                current, current_report = finish_frame(source, base, mask, state, strength=0.3)
                # finish_frame's standalone contract composes SOURCE outside
                # its mask.  In this ablation B2 is the approved base master,
                # so the adapter must preserve it byte-exactly outside the
                # effective finishing mask.
                current[~active] = base[~active]
            else:
                current, current_report = base.copy(), {"applied": False, "reason": "protected_previous_scene"}

            eroded = cv2.erode(active.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
            if index >= SCENE_START:
                local, local_report = luma_unsharp(base, eroded, amount=0.10, cap_y=2.0)
            else:
                local, local_report = base.copy(), {"changed_pixels": 0, "max_channel_delta": 0, "max_y_delta": 0}

            film_selected = np.zeros((H, W), bool)
            x0, y0, x1, y1 = FILM
            film_selected[y0:y1, x0:x1] = True
            optional, optional_report = luma_unsharp(base, film_selected, amount=0.04, cap_y=1.0)

            outputs = {"current": current, "luma-local": local, "film-optional": optional}
            reports = {"current": current_report, "luma-local": local_report, "film-optional": optional_report}
            for name, output in outputs.items():
                delta = np.abs(output.astype(np.int16) - base.astype(np.int16))
                changed = np.any(delta > 0, axis=2)
                cv2.imwrite(str(args.output / name / "change-maps" / f"{index:06d}.png"), changed.astype(np.uint8) * 255)
                reports[name].update({
                    "frame": index,
                    "actual_changed_pixels": int(changed.sum()),
                    "actual_max_channel_delta": int(delta.max()),
                    "outside_archived_mask_changed": int((changed & ~active).sum()),
                })
                frame_reports[name].append(reports[name])
                assert writers[name].stdin is not None
                writers[name].stdin.write(np.ascontiguousarray(output).tobytes())
        for cap in caps:
            extra, _ = cap.read()
            if extra:
                raise ValueError("input/master has extra frames")
        for name, writer in writers.items():
            writer.stdin.close()
            if writer.wait() != 0:
                raise RuntimeError(f"master encoder failed for {name}")
    finally:
        for cap in caps:
            cap.release()
        for writer in writers.values():
            if writer.poll() is None:
                writer.kill()

    for name, meta in variants.items():
        rows = frame_reports[name]
        master = args.output / name / "master.mp4"
        delivery = args.output / name / "delivery-crf14.mp4"
        encoding = encode_delivery(master, audio_path, delivery, 14)
        current_applied = sum(bool(row.get("applied")) for row in rows)
        report = {
            "phase": 4,
            "variant": name,
            **meta,
            "base_master": str(base_path),
            "source": str(source_path),
            "scene_start": SCENE_START,
            "effective_mask": "archived composition intersect safe-wide per-frame mask for frames 104..146",
            "film_xyxy": FILM,
            "current_finish_triggered_frames": current_applied if name == "current" else None,
            "changed_pixels": int(sum(row["actual_changed_pixels"] for row in rows)),
            "max_channel_delta": int(max(row["actual_max_channel_delta"] for row in rows)),
            "outside_archived_mask_changed": int(sum(row["outside_archived_mask_changed"] for row in rows)),
            "frame_reports": rows,
            "master": str(master),
            "delivery": str(delivery),
            "encoding": encoding,
            "gpu": False,
            "cloud_cost_usd": 0,
            "decision": "RETEST_MOTION",
        }
        (args.output / name / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {"seconds": round(time.perf_counter() - started, 3), "variants": {
        name: {"changed_pixels": sum(r["actual_changed_pixels"] for r in rows),
               "max_channel_delta": max(r["actual_max_channel_delta"] for r in rows),
               "outside_mask_changed": sum(r["outside_archived_mask_changed"] for r in rows)}
        for name, rows in frame_reports.items()}}
    (args.output / "build-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
