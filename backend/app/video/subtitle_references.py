"""Recover modest luminance detail from verified pixels in the same shot.

The caller supplies small, identically positioned crops and masks that cover
text AND its effects. This module cannot verify that frames belong to one shot,
nor infer undetected text. It never synthesizes texture, transfers low-frequency
structure, or modifies pixels outside the destination mask. Uncertain alignment
or visibility leaves the reconstruction unchanged.
"""
from __future__ import annotations

import math

import cv2
import numpy as np


MAX_DONORS = 8
MAX_PIXELS = 1_048_576
MAX_SIDE = 1536
_HALO = 8


def _mask(value: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    if not isinstance(value, np.ndarray) or value.shape != shape:
        raise ValueError("mask must match the crop height and width")
    return np.where(value > 0, 255, 0).astype(np.uint8)


def _expand(mask: np.ndarray, radius: int) -> np.ndarray:
    return cv2.dilate(mask, np.ones((2 * radius + 1, 2 * radius + 1), np.uint8))


def _gray(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def _high_pass(gray: np.ndarray) -> np.ndarray:
    floating = gray.astype(np.float32)
    return floating - cv2.GaussianBlur(floating, (7, 7), 1.2)


def _correlation(left: np.ndarray, right: np.ndarray) -> float:
    a = left.astype(np.float64) - float(np.mean(left))
    b = right.astype(np.float64) - float(np.mean(right))
    scale = float(np.sqrt(np.sum(a * a) * np.sum(b * b)))
    return float(np.sum(a * b) / scale) if scale > 1e-6 else 0.0


def recover_detail(original: np.ndarray, reconstructed: np.ndarray,
                   mask: np.ndarray, donors: list[tuple[np.ndarray, np.ndarray]],
                   *, strength: float = 0.25) -> tuple[np.ndarray, dict]:
    """Align up to eight donors; weakly replace missing high-frequency detail.

    All frames must be BGR uint8 crops of the same geometry from ONE scene.
    Donor masks are expanded by eight pixels before matching or transfer. ORB
    matching is bounded to a 640px image and an 800-feature budget. Only modest
    affine motion, distributed inliers, matching nearby clean pixels, compatible
    underlying luminance and genuinely useful donor detail permit a transfer.

    The returned image is independent of the inputs. ``coverage`` is the fraction
    of masked pixels eligible for detail, not a quality or removal percentage.
    Invalid primary inputs raise ValueError; invalid/unusable donors are skipped.
    """
    if (not isinstance(original, np.ndarray) or original.dtype != np.uint8
            or original.ndim != 3 or original.shape[2] != 3
            or not isinstance(reconstructed, np.ndarray)
            or reconstructed.dtype != np.uint8 or reconstructed.shape != original.shape):
        raise ValueError("original and reconstructed must be matching BGR uint8 crops")
    if not math.isfinite(strength) or not 0 <= strength <= 0.5:
        raise ValueError("strength must be finite and between 0 and 0.5")
    height, width = original.shape[:2]
    destination_mask = _mask(mask, (height, width))
    destination = destination_mask > 0
    result = reconstructed.copy()
    masked_count = int(np.count_nonzero(destination))
    stats = {
        "donors_available": len(donors), "considered": 0, "accepted": 0,
        "rejected": 0, "masked_pixels": masked_count, "eligible_pixels": 0,
        "changed_pixels": 0, "coverage": 0.0, "strength": float(strength),
        "rejections": {}, "fallback": None,
    }

    def reject(reason: str) -> None:
        stats["rejected"] += 1
        counts = stats["rejections"]
        counts[reason] = counts.get(reason, 0) + 1

    if not masked_count or not donors or strength == 0:
        stats["fallback"] = "no_requested_detail"
        return result, stats
    if min(height, width) < 64 or height * width > MAX_PIXELS or max(height, width) > MAX_SIDE:
        stats["fallback"] = "crop_outside_resource_bounds"
        return result, stats

    source_gray = _gray(original)
    reconstructed_gray = _gray(reconstructed)
    source_high = _high_pass(source_gray)
    reconstructed_high = _high_pass(reconstructed_gray)
    reconstructed_low = cv2.GaussianBlur(reconstructed_gray.astype(np.float32), (0, 0), 3)
    source_clean = cv2.bitwise_not(_expand(destination_mask, _HALO))
    # Local validation excludes the caption halo but stays close to the repair.
    ring = (_expand(destination_mask, 40) > 0) & (source_clean > 0)
    if np.count_nonzero(ring) < 256 or float(np.std(source_high[ring])) < 2.0:
        stats["fallback"] = "insufficient_local_texture"
        return result, stats

    scale = min(1.0, 640 / max(height, width))
    feature_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    scale_x, scale_y = feature_size[0] / width, feature_size[1] / height

    def features(gray: np.ndarray, valid: np.ndarray):
        # ORB descriptors inspect a neighborhood around each keypoint; merely
        # masking keypoint centers would still let hidden text influence them.
        visible = np.where(valid > 0, gray, 0).astype(np.uint8)
        small = cv2.resize(visible, feature_size, interpolation=cv2.INTER_AREA)
        # INTER_AREA plus an all-clean threshold prevents downsampled masks from
        # exposing text pixels at mask boundaries.
        small_valid = cv2.resize(valid, feature_size, interpolation=cv2.INTER_AREA)
        small_valid = np.where(small_valid == 255, 255, 0).astype(np.uint8)
        return orb.detectAndCompute(small, small_valid)

    orb = cv2.ORB_create(nfeatures=800, edgeThreshold=15, patchSize=21, fastThreshold=10)
    target_keys, target_descriptors = features(source_gray, source_clean)
    if target_descriptors is None or len(target_keys) < 16:
        stats["fallback"] = "insufficient_alignment_features"
        return result, stats

    best_score = np.full((height, width), np.inf, np.float32)
    best_high = np.zeros((height, width), np.float32)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    for donor, donor_mask in donors[:MAX_DONORS]:
        stats["considered"] += 1
        if (not isinstance(donor, np.ndarray) or donor.dtype != np.uint8
                or donor.shape != original.shape):
            reject("invalid_donor")
            continue
        try:
            donor_binary = _mask(donor_mask, (height, width))
        except ValueError:
            reject("invalid_donor_mask")
            continue
        donor_clean = cv2.bitwise_not(_expand(donor_binary, _HALO))
        donor_gray = _gray(donor)
        keys, descriptors = features(donor_gray, donor_clean)
        if descriptors is None or len(keys) < 16:
            reject("insufficient_alignment_features")
            continue
        pairs = matcher.knnMatch(descriptors, target_descriptors, k=2)
        good = [pair[0] for pair in pairs if len(pair) == 2
                and pair[0].distance < 0.7 * pair[1].distance
                and pair[0].distance <= 48]
        # A repeated pattern must not send many matches to the same feature.
        unique = {}
        for match in sorted(good, key=lambda value: value.distance):
            unique.setdefault(match.trainIdx, match)
        good = list(unique.values())
        if len(good) < 12:
            reject("insufficient_unique_matches")
            continue
        donor_points = np.float32([keys[m.queryIdx].pt for m in good]) / (scale_x, scale_y)
        target_points = np.float32([target_keys[m.trainIdx].pt for m in good]) / (scale_x, scale_y)
        transform, inliers = cv2.estimateAffinePartial2D(
            donor_points, target_points, method=cv2.RANSAC, ransacReprojThreshold=1.75,
            maxIters=600, confidence=0.99, refineIters=10)
        if transform is None or inliers is None or not np.isfinite(transform).all():
            reject("unreliable_alignment")
            continue
        inlier = inliers.ravel().astype(bool)
        if int(np.count_nonzero(inlier)) < 10 or float(np.mean(inlier)) < 0.7:
            reject("unreliable_alignment")
            continue
        extent = np.ptp(target_points[inlier], axis=0)
        if extent[0] < width * 0.35 or extent[1] < height * 0.35:
            reject("localized_alignment_only")
            continue
        zoom = math.hypot(float(transform[0, 0]), float(transform[1, 0]))
        angle = abs(math.degrees(math.atan2(float(transform[1, 0]), float(transform[0, 0]))))
        shift = float(np.linalg.norm(transform[:, 2]))
        if not 0.92 <= zoom <= 1.08 or angle > 8 or shift > max(height, width) * 0.18:
            reject("excessive_motion")
            continue
        projected = donor_points @ transform[:, :2].T + transform[:, 2]
        reprojection = float(np.median(np.linalg.norm(projected[inlier] - target_points[inlier], axis=1)))
        if reprojection > 1.0:
            reject("imprecise_alignment")
            continue
        warped = cv2.warpAffine(donor_gray, transform, (width, height), flags=cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        valid = cv2.warpAffine(donor_clean, transform, (width, height), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        # High-pass kernels and interpolation must not touch hidden donor pixels
        # or the edge outside the donor image.
        valid = cv2.erode(np.where(valid == 255, 255, 0).astype(np.uint8),
                          np.ones((7, 7), np.uint8), borderType=cv2.BORDER_CONSTANT,
                          borderValue=0) > 0
        nearby = ring & valid
        if np.count_nonzero(nearby) < 256 or np.count_nonzero(nearby) < np.count_nonzero(ring) * 0.6:
            reject("insufficient_local_visibility")
            continue
        warped_high = _high_pass(warped)
        difference = source_gray[nearby].astype(np.float32) - warped[nearby].astype(np.float32)
        offset = float(np.median(difference))
        error = np.abs(difference - offset)
        median_error, tail_error = float(np.median(error)), float(np.percentile(error, 90))
        correlation = _correlation(source_high[nearby], warped_high[nearby])
        if abs(offset) > 10 or median_error > 8 or tail_error > 24 or correlation < 0.75:
            reject("local_appearance_mismatch")
            continue
        candidate = destination & valid
        warped_low = cv2.GaussianBlur(warped.astype(np.float32), (0, 0), 3)
        # Detail transfer is not a second structure reconstruction: reject pixels
        # where the donor suggests a materially different underlying surface.
        candidate &= np.abs(warped_low + offset - reconstructed_low) <= 18
        if np.count_nonzero(candidate) < 16:
            reject("no_visible_compatible_detail")
            continue
        donor_energy = float(np.std(warped_high[candidate]))
        current_energy = float(np.std(reconstructed_high[candidate]))
        if donor_energy < 2.0 or donor_energy <= current_energy * 1.08:
            reject("no_missing_detail")
            continue
        score = median_error + tail_error * 0.2 + (1 - correlation) * 10 + reprojection
        choose = candidate & (score < best_score)
        best_score[choose] = score
        best_high[choose] = warped_high[choose]
        stats["accepted"] += 1

    eligible = np.isfinite(best_score) & destination
    eligible_count = int(np.count_nonzero(eligible))
    if not eligible_count:
        stats["fallback"] = "no_verified_detail"
        return result, stats
    # Equal BGR increments transfer luminance detail while retaining the
    # reconstructed chroma. A four-level cap avoids turning noise into outlines.
    delta = np.clip((best_high - reconstructed_high) * strength, -4.0, 4.0)
    result[eligible] = np.clip(np.rint(reconstructed[eligible].astype(np.float32)
                                     + delta[eligible, None]), 0, 255).astype(np.uint8)
    stats["eligible_pixels"] = eligible_count
    stats["changed_pixels"] = int(np.count_nonzero(np.any(result != reconstructed, axis=2)))
    stats["coverage"] = round(eligible_count / masked_count, 6)
    return result, stats
