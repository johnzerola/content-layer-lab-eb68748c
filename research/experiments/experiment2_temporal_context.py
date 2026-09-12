"""Experiment 2A: fixed-parameter temporal donor expansion for the sweater shot.

This is a laboratory instrument. It imports the exact Farneback alignment and
acceptance thresholds used by ``phase23_donors.py`` and changes only the donor
availability. Vmake is never read. Warped samples are source-derived bilinear
samples; they are not described as bit-exact sensor pixels.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np
from skimage.metrics import structural_similarity

from phase23_donors import PARAMS, dilate, evaluate_pair, remap


SCENE_START = 104
SCENE_END = 198
TARGET_START = 104
TARGET_END = 146
OLD_POOL = [104, 112, 116, 128, 136, 145, 146]
EXPANDED_POOL = OLD_POOL + list(range(147, 199))
GT_TARGETS = list(range(118, 130))
GT_RECT = (270, 295, 590, 345)  # x1,y1,x2,y2 in the fixed 820x410 donor ROI
LABELS = {
    1: "OBSERVED_REAL",
    2: "RECOVERABLE",
    3: "UNCERTAIN",
    4: "OCCLUDED",
    5: "NO_VALID_DONOR",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_scene(source_dir: Path, mask_dir: Path):
    images, masks = {}, {}
    for frame in range(SCENE_START, SCENE_END + 1):
        image_path = source_dir / f"{frame:06d}.png"
        mask_path = mask_dir / f"{frame:06d}.png"
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        if image is None or image.shape != (410, 820, 3):
            raise ValueError(f"invalid source crop {image_path}: {None if image is None else image.shape}")
        if mask is None or mask.shape != (410, 820):
            raise ValueError(f"invalid source mask {mask_path}: {None if mask is None else mask.shape}")
        images[frame] = image
        masks[frame] = mask > 0
    return images, masks


def _safe_mean(values: np.ndarray, support: np.ndarray):
    return float(values[support].mean()) if support.any() else None


def _safe_percentile(values: np.ndarray, support: np.ndarray, q: float):
    return float(np.percentile(values[support], q)) if support.any() else None


def _texture_correlation(a: np.ndarray, b: np.ndarray, support: np.ndarray):
    if int(support.sum()) < 32:
        return None
    ag = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ah = ag - cv2.GaussianBlur(ag, (0, 0), 1.2)
    bh = bg - cv2.GaussianBlur(bg, (0, 0), 1.2)
    av, bv = ah[support], bh[support]
    av -= av.mean(); bv -= bv.mean()
    scale = float(np.linalg.norm(av) * np.linalg.norm(bv))
    return float(np.dot(av, bv) / scale) if scale > 1e-6 else None


def pair_summary(pair: dict, target: np.ndarray, donor: np.ndarray,
                 target_mask: np.ndarray, donor_mask: np.ndarray,
                 target_frame: int, donor_frame: int) -> dict:
    tm = dilate(target_mask, PARAMS["target_guard_px"])
    ring = dilate(target_mask, 18) & ~tm & pair["valid"] & pair["clean"] & (pair["fb"] < PARAMS["fb_max_px"])
    tg = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY).astype(np.float32)
    wg = cv2.cvtColor(pair["warped"], cv2.COLOR_BGR2GRAY).astype(np.float32)
    mask = target_mask
    fail_masks = {
        "out_of_frame": ~pair["valid"],
        "donor_caption_or_halo": ~pair["clean"],
        "fb_inconsistent_or_occluded": pair["fb"] >= PARAMS["fb_max_px"],
        "insufficient_visible_support": pair["support_fraction"] < PARAMS["clean_support_fraction"],
        "support_photometric_mismatch": pair["photo"] >= PARAMS["support_photo_mae_max"],
        "support_gradient_mismatch": pair["gradient"] >= PARAMS["support_gradient_mae_max"],
        "far_from_observed_support": pair["distance"] >= PARAMS["clean_support_distance_max_px"],
        "confidence_below_threshold": pair["confidence"] < PARAMS["confidence_threshold"],
    }
    failures = {name: int((value & mask).sum()) for name, value in fail_masks.items()}
    ranked = sorted(failures.items(), key=lambda item: (-item[1], item[0]))
    return {
        "target_frame": target_frame,
        "donor_frame": donor_frame,
        "temporal_distance_frames": abs(donor_frame - target_frame),
        "region": "approved_subtitle_mask_within_sweater_ROI",
        "masked_pixels": int(mask.sum()),
        "donor_mask_pixels": int(donor_mask.sum()),
        "donor_has_detected_caption_or_halo": bool(donor_mask.any()),
        "eligible_before_cross_donor_agreement": int((pair["eligible"] & mask).sum()),
        "supported_after_cross_donor_agreement": 0,
        "selected_pixels_before_temporal_veto": 0,
        "mean_fb_error_px": _safe_mean(pair["fb"], mask),
        "p95_fb_error_px": _safe_percentile(pair["fb"], mask, 95),
        "mean_support_photo_mae": _safe_mean(pair["photo"], mask),
        "mean_support_gradient_mae": _safe_mean(pair["gradient"], mask),
        "mean_confidence": _safe_mean(pair["confidence"], mask),
        "visible_clean_mapped_pixels": int((pair["valid"] & pair["clean"] & mask).sum()),
        "occlusion_proxy_pixels": int(((~pair["valid"] | (pair["fb"] >= PARAMS["fb_max_px"])) & mask).sum()),
        "ring_luma_offset_target_minus_donor": _safe_mean(tg - wg, ring),
        "ring_texture_correlation": _texture_correlation(target, pair["warped"], ring),
        "rejection_pixels_nonexclusive": failures,
        "dominant_rejection_reasons": [name for name, count in ranked[:3] if count],
        "status": "PENDING_CROSS_DONOR_AGREEMENT",
        "reason": None,
    }


def select_donors(target: np.ndarray, target_mask: np.ndarray,
                  images: dict[int, np.ndarray], masks: dict[int, np.ndarray],
                  pool: list[int], target_frame: int | None = None):
    pairs, rows, donor_ids = [], [], []
    for donor_frame in pool:
        if target_frame is not None and donor_frame == target_frame:
            continue
        pair = evaluate_pair(target, images[donor_frame], target_mask, masks[donor_frame])
        rows.append(pair_summary(pair, target, images[donor_frame], target_mask,
                                 masks[donor_frame], -1, donor_frame))
        pairs.append({
            "warped": pair["warped"],
            "eligible": pair["eligible"],
            "confidence": pair["confidence"],
            "visible": pair["valid"] & pair["clean"],
            "geometric": pair["valid"] & (pair["fb"] < PARAMS["fb_max_px"]),
        })
        donor_ids.append(donor_frame)

    shape = target_mask.shape
    chosen = np.full(shape, -1, np.int16)
    chosen_confidence = np.zeros(shape, np.float32)
    candidate = target.copy()
    accepted = np.zeros(shape, bool)
    ys, xs = np.where(target_mask)
    if len(xs):
        y1, y2, x1, x2 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    else:
        y1 = y2 = x1 = x2 = 0
    for j, pair in enumerate(pairs):
        agreement = np.zeros((y2 - y1, x2 - x1), np.uint8)
        eligible_j = pair["eligible"][y1:y2, x1:x2]
        warped_j = pair["warped"][y1:y2, x1:x2]
        for k, other in enumerate(pairs):
            if j == k:
                continue
            difference = np.abs(warped_j.astype(np.float32) -
                                other["warped"][y1:y2, x1:x2].astype(np.float32)).mean(axis=2)
            agreement += (other["eligible"][y1:y2, x1:x2] &
                          (difference < PARAMS["cross_donor_rgb_mae_max"])).astype(np.uint8)
        supported = np.zeros(shape, bool)
        supported[y1:y2, x1:x2] = eligible_j & (agreement >= PARAMS["cross_donor_min"] - 1)
        supported &= target_mask
        pair["supported"] = supported
        rows[j]["supported_after_cross_donor_agreement"] = int(supported.sum())
        score = pair["confidence"] + (0.20 if donor_ids[j] == 146 else 0.10 if donor_ids[j] == 145 else 0)
        update = supported & (score > chosen_confidence)
        candidate[update] = pair["warped"][update]
        chosen[update] = donor_ids[j]
        chosen_confidence[update] = score[update]
        accepted |= supported
        rows[j]["status"] = "ACCEPT_PARTIAL" if supported.any() else "REJECT"
        rows[j]["reason"] = ("visible_clean_support_fb_confidence_and_cross_donor_agreement"
                             if supported.any() else "no_target_pixel_passed_all_fixed_checks")
    # Remove preference bonus exactly as the original instrument does.
    chosen_confidence.fill(0)
    for donor_id, pair in zip(donor_ids, pairs):
        selected = chosen == donor_id
        chosen_confidence[selected] = pair["confidence"][selected]
    for donor_id, row in zip(donor_ids, rows):
        row["selected_pixels_before_temporal_veto"] = int((chosen == donor_id).sum())
    any_visible = np.logical_or.reduce([p["visible"] for p in pairs]) if pairs else np.zeros(shape, bool)
    any_geometric = np.logical_or.reduce([p["geometric"] for p in pairs]) if pairs else np.zeros(shape, bool)
    labels = np.full(shape, 1, np.uint8)
    labels[target_mask] = 3
    labels[target_mask & ~any_visible & any_geometric] = 5
    labels[target_mask & ~any_geometric] = 4
    labels[accepted] = 2
    return candidate, accepted, chosen, chosen_confidence, labels, rows


def _load_one(path: Path, mode):
    value = cv2.imread(str(path), mode)
    if value is None:
        raise ValueError(f"missing {path}")
    return value


def process_real_batch(targets: list[int], source_dir: str, mask_dir: str,
                       output_dir: str, pool: list[int]):
    cv2.setNumThreads(2)
    source_dir, mask_dir, output_dir = Path(source_dir), Path(mask_dir), Path(output_dir)
    images, masks = load_scene(source_dir, mask_dir)
    results = []
    for frame in targets:
        started = time.perf_counter()
        candidate, accepted, chosen, confidence, labels, rows = select_donors(
            images[frame], masks[frame], images, masks, pool, target_frame=frame)
        for row in rows:
            row["target_frame"] = frame
        np.savez_compressed(output_dir / "pre-temporal" / f"{frame:06d}.npz",
                            accepted=accepted, selected_donor=chosen,
                            confidence=confidence, labels=labels)
        cv2.imwrite(str(output_dir / "candidate-pre-temporal" / f"{frame:06d}.png"), candidate)
        (output_dir / "pair-json" / f"{frame:06d}.json").write_text(
            json.dumps(rows, indent=2), encoding="utf-8")
        result = {"target_frame": frame, "masked_pixels": int(masks[frame].sum()),
                  "accepted_pre_temporal": int(accepted.sum()),
                  "seconds": time.perf_counter() - started}
        results.append(result)
        print(json.dumps(result), flush=True)
    return results


def finalize_real(source_dir: Path, mask_dir: Path, output_dir: Path):
    images, masks = load_scene(source_dir, mask_dir)
    candidates, accepted, chosen, confidence, labels = {}, {}, {}, {}, {}
    for frame in range(TARGET_START, TARGET_END + 1):
        candidates[frame] = _load_one(output_dir / "candidate-pre-temporal" / f"{frame:06d}.png", cv2.IMREAD_COLOR)
        data = np.load(output_dir / "pre-temporal" / f"{frame:06d}.npz")
        accepted[frame] = data["accepted"]
        chosen[frame] = data["selected_donor"]
        confidence[frame] = data["confidence"]
        labels[frame] = data["labels"]
    temporal = []
    rejected = {frame: np.zeros_like(masks[frame]) for frame in range(TARGET_START, TARGET_END + 1)}
    for frame in range(TARGET_START, TARGET_END):
        pair = evaluate_pair(images[frame], images[frame + 1], masks[frame], masks[frame + 1])
        warped_candidate = remap(candidates[frame + 1], pair["mapping"])
        valid_neighbor = (remap(accepted[frame + 1].astype(np.float32), pair["mapping"]) > .999) | pair["clean"]
        stable_support = pair["valid"] & (pair["fb"] < PARAMS["fb_max_px"]) & valid_neighbor & accepted[frame]
        delta = np.abs(candidates[frame].astype(np.float32) - warped_candidate.astype(np.float32)).mean(axis=2)
        bad = stable_support & (delta > PARAMS["temporal_consistency_mae_max"])
        rejected[frame] |= bad
        temporal.append({"source_frame": frame, "next_source_frame": frame + 1,
                         "tested_pixels": int(stable_support.sum()),
                         "rejected_pixels": int(bad.sum()),
                         "mean_warped_rgb_mae": _safe_mean(delta, stable_support)})
    colors = np.array([[0, 0, 0], [80, 180, 80], [40, 220, 40],
                       [0, 180, 255], [255, 90, 20], [220, 40, 220]], np.uint8)
    frames_report = []
    old_root = Path(r"G:/dowloand/teste/phase-2-3-20260910/donors/primary/maps")
    for frame in range(TARGET_START, TARGET_END + 1):
        bad = rejected[frame]
        if bad.any():
            accepted[frame][bad] = False
            candidates[frame][bad] = images[frame][bad]
            confidence[frame][bad] = 0
            chosen[frame][bad] = -1
            labels[frame][bad] = 3
        old_data = np.load(old_root / f"{frame:06d}-final.npz")
        old_accepted = old_data["accepted"]
        newly_recoverable = accepted[frame] & ~old_accepted
        lost_old = old_accepted & ~accepted[frame]
        cv2.imwrite(str(output_dir / "candidate-final" / f"{frame:06d}.png"), candidates[frame])
        cv2.imwrite(str(output_dir / "labels" / f"{frame:06d}.png"), labels[frame])
        cv2.imwrite(str(output_dir / "confidence" / f"{frame:06d}.png"),
                    np.clip(confidence[frame] * 65535, 0, 65535).astype(np.uint16))
        cv2.imwrite(str(output_dir / "donor-index" / f"{frame:06d}.png"), (chosen[frame] + 1).astype(np.uint16))
        cv2.imwrite(str(output_dir / "newly-recoverable" / f"{frame:06d}.png"),
                    (newly_recoverable * 255).astype(np.uint8))
        visual = images[frame].copy(); active = labels[frame] != 1
        visual[active] = (visual[active].astype(np.float32) * .35 + colors[labels[frame][active]] * .65).astype(np.uint8)
        cv2.imwrite(str(output_dir / "review" / f"{frame:06d}-labels.png"), visual)
        np.savez_compressed(output_dir / "maps" / f"{frame:06d}.npz",
                            labels=labels[frame], accepted=accepted[frame],
                            selected_donor=chosen[frame], confidence=confidence[frame],
                            newly_recoverable=newly_recoverable, old_accepted=old_accepted)
        counts = {name: int((labels[frame] == code).sum()) for code, name in LABELS.items()}
        frames_report.append({"source_frame": frame, "masked_pixels": int(masks[frame].sum()),
                              "old_accepted_pixels": int(old_accepted.sum()),
                              "expanded_accepted_pixels": int(accepted[frame].sum()),
                              "newly_recoverable_pixels": int(newly_recoverable.sum()),
                              "old_pixels_lost_after_pool_interaction_or_veto": int(lost_old.sum()),
                              "selected_from_147_198": int(((chosen[frame] >= 147) & accepted[frame]).sum()),
                              "label_counts_full_roi": counts})
    all_rows = []
    for frame in range(TARGET_START, TARGET_END + 1):
        all_rows.extend(json.loads((output_dir / "pair-json" / f"{frame:06d}.json").read_text(encoding="utf-8")))
    with (output_dir / "donor-decisions.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        for row in all_rows:
            row = dict(row)
            row["dominant_rejection_reasons"] = json.dumps(row["dominant_rejection_reasons"])
            row["rejection_pixels_nonexclusive"] = json.dumps(row["rejection_pixels_nonexclusive"], sort_keys=True)
            writer.writerow(row)
    return frames_report, temporal, all_rows


def inventory(images, masks):
    rows = []
    x1, y1, x2, y2 = GT_RECT
    for frame in range(SCENE_START, SCENE_END + 1):
        image = images[frame]; mask = masks[frame]
        b, g, r = [image[..., c].astype(np.int16) for c in range(3)]
        green_core = (g - r > 16) & (g - b > 12) & (g > 45)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
        high = gray - cv2.GaussianBlur(gray, (0, 0), 1.2)
        patch = np.zeros(mask.shape, bool); patch[y1:y2, x1:x2] = True
        rows.append({"frame": frame, "new_context": frame >= 147,
                     "detected_caption_or_halo_pixels": int(mask.sum()),
                     "green_core_pixels": int(green_core.sum()),
                     "mean_luma": float(gray.mean()),
                     "gt_patch_luma": float(gray[patch].mean()),
                     "gt_patch_texture_std": float(high[patch].std()),
                     "frame_role": "target_and_old_pool" if frame <= 146 else "new_donor_candidate"})
    return rows


def metric_frame(gt, candidate, mask):
    gray_gt = cv2.cvtColor(gt, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray_c = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY).astype(np.float32)
    diff = np.abs(gt.astype(np.float32) - candidate.astype(np.float32)).mean(axis=2)
    x, y, w, h = cv2.boundingRect(mask.astype(np.uint8))
    crop_gt, crop_c = gray_gt[y:y+h, x:x+w], gray_c[y:y+h, x:x+w]
    grad_gt = cv2.magnitude(cv2.Sobel(gray_gt, cv2.CV_32F, 1, 0), cv2.Sobel(gray_gt, cv2.CV_32F, 0, 1))
    grad_c = cv2.magnitude(cv2.Sobel(gray_c, cv2.CV_32F, 1, 0), cv2.Sobel(gray_c, cv2.CV_32F, 0, 1))
    hp_gt = gray_gt - cv2.GaussianBlur(gray_gt, (0, 0), 1.2)
    hp_c = gray_c - cv2.GaussianBlur(gray_c, (0, 0), 1.2)
    mse = float(np.mean((gt.astype(np.float32)[mask] - candidate.astype(np.float32)[mask]) ** 2))
    return {"mae": float(diff[mask].mean()), "psnr_db": float(10 * math.log10(255 ** 2 / mse)) if mse else None,
            "ssim_luma_crop": float(structural_similarity(crop_gt, crop_c, data_range=255)),
            "gradient_ratio": float(grad_c[mask].mean() / max(1e-6, grad_gt[mask].mean())),
            "edge_mae": float(np.abs(grad_gt - grad_c)[mask].mean()),
            "texture_std_ratio": float(hp_c[mask].std() / max(1e-6, hp_gt[mask].std())),
            "texture_correlation": _texture_correlation(gt, candidate, mask)}


def run_gt(source_dir: Path, mask_dir: Path, output_dir: Path):
    images, masks = load_scene(source_dir, mask_dir)
    x1, y1, x2, y2 = GT_RECT
    synthetic = np.zeros((410, 820), bool); synthetic[y1:y2, x1:x2] = True
    pools = {"old": OLD_POOL, "expanded": EXPANDED_POOL}
    candidates_by_pool, accepted_by_pool = {}, {}
    per_frame = []
    for pool_name, pool in pools.items():
        candidates_by_pool[pool_name], accepted_by_pool[pool_name] = {}, {}
        for frame in GT_TARGETS:
            union = masks[frame] | synthetic
            base = cv2.inpaint(images[frame], (union * 255).astype(np.uint8), 3, cv2.INPAINT_TELEA)
            donor_candidate, accepted, chosen, confidence, labels, rows = select_donors(
                images[frame], union, images, masks, pool, target_frame=frame)
            result = base.copy(); result[accepted] = donor_candidate[accepted]
            candidates_by_pool[pool_name][frame] = result
            accepted_by_pool[pool_name][frame] = accepted
            cv2.imwrite(str(output_dir / pool_name / f"{frame:06d}.png"), result)
            np.savez_compressed(output_dir / pool_name / f"{frame:06d}.npz",
                                accepted=accepted, chosen=chosen, confidence=confidence,
                                synthetic_mask=synthetic, union_mask=union)
            metrics = metric_frame(images[frame], result, synthetic)
            metrics.update(pool=pool_name, frame=frame,
                           synthetic_pixels=int(synthetic.sum()),
                           recovered_synthetic_pixels=int((accepted & synthetic).sum()),
                           recovered_fraction=float((accepted & synthetic).sum() / synthetic.sum()))
            per_frame.append(metrics)
            print(json.dumps({"gt": pool_name, "frame": frame, "mae": metrics["mae"]}), flush=True)
    # Temporal proxy uses the exact adjacent-frame flow evaluator and only the synthetic patch.
    temporal = []
    for pool_name in pools:
        for frame in GT_TARGETS[:-1]:
            pair = evaluate_pair(images[frame], images[frame + 1], masks[frame] | synthetic,
                                 masks[frame + 1] | synthetic)
            warped = remap(candidates_by_pool[pool_name][frame + 1], pair["mapping"])
            valid = synthetic & pair["valid"] & (pair["fb"] < PARAMS["fb_max_px"])
            delta = np.abs(candidates_by_pool[pool_name][frame].astype(np.float32) - warped.astype(np.float32)).mean(axis=2)
            temporal.append({"pool": pool_name, "frame": frame, "next_frame": frame + 1,
                             "tested_pixels": int(valid.sum()),
                             "warped_rgb_mae": _safe_mean(delta, valid)})
    aggregates = {}
    for pool_name in pools:
        rows = [row for row in per_frame if row["pool"] == pool_name]
        aggregates[pool_name] = {key: float(np.mean([row[key] for row in rows if row[key] is not None]))
                                 for key in ("mae", "ssim_luma_crop", "gradient_ratio", "edge_mae",
                                             "texture_std_ratio", "texture_correlation", "recovered_fraction")}
        trows = [row for row in temporal if row["pool"] == pool_name and row["warped_rgb_mae"] is not None]
        aggregates[pool_name]["temporal_warped_rgb_mae"] = float(np.mean([row["warped_rgb_mae"] for row in trows]))
    old_mae, new_mae = aggregates["old"]["mae"], aggregates["expanded"]["mae"]
    aggregates["mae_reduction_percent"] = 100 * (old_mae - new_mae) / old_mae if old_mae else None
    result = {"targets": GT_TARGETS, "synthetic_rect_xyxy": GT_RECT,
              "method": "Telea corruption baseline plus only donor samples that pass unchanged Phase 2/3 checks",
              "lpips": None, "lpips_reason": "dependency/weights not installed; not replaced by zero",
              "per_frame": per_frame, "temporal": temporal, "aggregate": aggregates}
    (output_dir / "ground-truth-control.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def ensure_dirs(root: Path):
    for name in ("pre-temporal", "candidate-pre-temporal", "candidate-final", "pair-json",
                 "labels", "confidence", "donor-index", "newly-recoverable", "review", "maps",
                 "ground-truth/old", "ground-truth/expanded"):
        (root / name).mkdir(parents=True, exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path(r"G:/dowloand/teste/phase-2-3-20260910/donors/primary/source-crop"))
    parser.add_argument("--mask-dir", type=Path, default=Path(r"G:/dowloand/teste/phase-2-3-20260910/donors/primary/source-masks"))
    parser.add_argument("--output", type=Path, default=Path(r"G:/dowloand/teste/experiment-2-temporal-context-20260911/donors"))
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=6)
    parser.add_argument("--pool-mode", choices=("old", "expanded"), default="expanded")
    parser.add_argument("--smoke-target", type=int)
    parser.add_argument("--skip-real", action="store_true")
    parser.add_argument("--skip-gt", action="store_true")
    args = parser.parse_args()
    started = time.perf_counter(); ensure_dirs(args.output)
    images, masks = load_scene(args.source_dir, args.mask_dir)
    inv = inventory(images, masks)
    (args.output / "donor-inventory.json").write_text(json.dumps(inv, indent=2), encoding="utf-8")
    batches = []
    if not args.skip_real:
        targets = [args.smoke_target] if args.smoke_target is not None else list(range(TARGET_START, TARGET_END + 1))
        pending = [frame for frame in targets if not (args.output / "pre-temporal" / f"{frame:06d}.npz").exists()]
        batches = [pending[i:i + args.batch_size] for i in range(0, len(pending), args.batch_size)]
        selected_pool = OLD_POOL if args.pool_mode == "old" else EXPANDED_POOL
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            futures = [executor.submit(process_real_batch, batch, str(args.source_dir), str(args.mask_dir),
                                       str(args.output), selected_pool) for batch in batches]
            for future in as_completed(futures):
                future.result()
        if args.smoke_target is None:
            frames_report, temporal, all_rows = finalize_real(args.source_dir, args.mask_dir, args.output)
        else:
            frames_report = temporal = all_rows = []
    else:
        frames_report, temporal, all_rows = finalize_real(args.source_dir, args.mask_dir, args.output)
    gt = None if args.skip_gt or args.smoke_target is not None else run_gt(
        args.source_dir, args.mask_dir, args.output / "ground-truth")
    report = {
        "experiment": "2A fixed-parameter donor context expansion",
        "status": "SMOKE_COMPLETED" if args.smoke_target is not None else "COMPLETED",
        "source_scene_inclusive": [SCENE_START, SCENE_END],
        "target_frames_inclusive": [TARGET_START, TARGET_END],
        "old_pool": OLD_POOL,
        "added_pool_systematic": list(range(147, 199)),
        "pool_mode": args.pool_mode,
        "active_pool": OLD_POOL if args.pool_mode == "old" else EXPANDED_POOL,
        "expanded_pool": EXPANDED_POOL,
        "only_variable_changed": "donor availability",
        "parameters_unchanged": PARAMS,
        "labels": LABELS,
        "warped_sample_semantics": "bilinearly interpolated source observation after estimated flow; not bit-exact",
        "frames": frames_report,
        "temporal_checks": temporal,
        "ground_truth_control": gt,
        "inventory": inv,
        "processing_seconds": time.perf_counter() - started,
        "workers": args.workers,
        "batch_size": args.batch_size,
        "cloud_gpu_cost_usd": 0,
        "vmake_read": False,
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(args.output / "report.json"), "seconds": report["processing_seconds"]}), flush=True)


if __name__ == "__main__":
    main()
