"""Experimental scene-local visibility and transition refinement.

Original text is never blended through the opaque exclusion core. A transfer
requires two locally consistent, unoccluded donor observations. Model images
guide flow only; all transferred pixels come from original donor frames.
"""
from dataclasses import dataclass

import cv2
import numpy as np


def expand(mask, radius):
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1,) * 2))


def exclusion_mask(frame, detected, allowed):
    """Keep detected effects opaque; grow connected colour effects, then halo.

    Detection must already cover black outlines/shadows. This conservative
    supplement is not a universal shadow or neon detector.
    """
    if frame.dtype != np.uint8 or frame.shape[:2] != detected.shape or allowed.shape != detected.shape:
        raise ValueError("invalid exclusion inputs")
    seed = np.where((detected > 0) & (allowed > 0), 255, 0).astype(np.uint8)
    if not seed.any():
        return seed
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    colourful = (seed > 0) & (hsv[..., 1] >= 110) & (hsv[..., 2] >= 110)
    if colourful.sum() >= 16:
        histogram = np.bincount(hsv[..., 0][colourful], minlength=180)
        hue = int(np.argmax(histogram))
        delta = np.abs(hsv[..., 0].astype(np.int16) - hue)
        compatible = ((np.minimum(delta, 180 - delta) <= 10) & (hsv[..., 1] >= 55)
                      & (hsv[..., 2] >= 35) & (expand(seed, 12) > 0) & (allowed > 0))
        grown = seed.copy()
        # Geodesic growth cannot jump to disconnected objects of the same hue.
        for _ in range(12):
            grown = np.where((grown > 0) | ((expand(grown, 1) > 0) & compatible), 255, 0).astype(np.uint8)
        seed = grown
    return cv2.bitwise_and(expand(seed, 3), np.where(allowed > 0, 255, 0).astype(np.uint8))


@dataclass
class Donor:
    original: np.ndarray
    guide: np.ndarray
    excluded: np.ndarray


def _valid_image(image, shape):
    return isinstance(image, np.ndarray) and image.shape == shape and image.dtype == np.uint8


def _flow_pair(target, donor):
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    flow.setFinestScale(0)
    return flow.calc(target, donor, None), flow.calc(donor, target, None)


def _observations(original, guide, excluded, donor):
    h, w = excluded.shape
    forward, backward = _flow_pair(cv2.cvtColor(guide, cv2.COLOR_BGR2GRAY),
                                   cv2.cvtColor(donor.guide, cv2.COLOR_BGR2GRAY))
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    mx, my = xx + forward[..., 0], yy + forward[..., 1]
    def warp(image):
        return cv2.remap(image, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    warped = warp(donor.original)
    back = warp(backward)
    fb = np.linalg.norm(forward + back, axis=2)
    valid = (warp(expand(donor.excluded, 3)) == 0) & (mx >= 2) & (mx < w - 3) & (my >= 2) & (my < h - 3)
    valid &= np.isfinite(forward).all(axis=2) & np.isfinite(back).all(axis=2) & (fb <= .75)
    valid &= np.linalg.norm(forward, axis=2) <= min(48, max(h, w) * .12)
    clean = valid & (expand(excluded, 3) == 0)
    error = np.max(np.abs(original.astype(np.float32) - warped.astype(np.float32)), axis=2)
    # A wide local ring reaches past caption interiors without assuming one
    # affine transform fits both foreground clothes and the background.
    area = cv2.boxFilter(clean.astype(np.float32), -1, (97, 97), normalize=True, borderType=cv2.BORDER_CONSTANT)
    mean_error = cv2.boxFilter(error * clean, -1, (97, 97), normalize=True, borderType=cv2.BORDER_CONSTANT) / np.maximum(area, 1e-6)
    bad = cv2.boxFilter(((error > 16) & clean).astype(np.float32), -1, (97, 97), normalize=True, borderType=cv2.BORDER_CONSTANT) / np.maximum(area, 1e-6)
    valid &= (area >= .18) & (mean_error <= 6) & (bad <= .12)
    # Flow estimated through an obscured region must agree with its nearby
    # motion field. Do not copy into a fold/occlusion with divergent motion.
    for axis in range(2):
        local = cv2.GaussianBlur(forward[..., axis], (0, 0), 3)
        valid &= np.abs(forward[..., axis] - local) <= 1.0
    low = cv2.GaussianBlur(warped.astype(np.float32), (0, 0), 3)
    base_low = cv2.GaussianBlur(guide.astype(np.float32), (0, 0), 3)
    valid &= np.max(np.abs(low - base_low), axis=2) <= 24
    return warped, valid, mean_error + fb * 3


def refine_junctions(original, rebuilt, composite, excluded, allowed, donors):
    """Return (mask-only, mask+references, report), each bounded to selection.

    Call only on crops from one known shot, using up to four independent
    original frames. Unknown/invalid evidence leaves the baseline unchanged.
    """
    if (not isinstance(original, np.ndarray) or original.ndim != 3 or original.shape[2] != 3
            or not _valid_image(original, original.shape) or not _valid_image(rebuilt, original.shape)):
        raise ValueError("expected matching BGR uint8 images")
    shape = original.shape[:2]
    if any(not isinstance(m, np.ndarray) or m.shape != shape for m in (composite, excluded, allowed)):
        raise ValueError("invalid junction mask")
    if min(shape) < 64 or max(shape) > 1536 or shape[0] * shape[1] > 1_048_576:
        raise ValueError("junction crop outside resource bounds")
    selected = (composite > 0) & (allowed > 0)
    baseline = original.copy()
    baseline[selected] = rebuilt[selected]
    report = {"donors": 0, "accepted_observations": 0, "consensus_pixels": 0,
              "original_pixels_recovered": 0, "donor_pixels_changed": 0, "fallback": None}
    if not selected.any() or len(donors) < 2:
        report["fallback"] = "insufficient_donors_or_empty_mask"
        return baseline, baseline.copy(), report
    guide = original.copy()
    guide[selected] = rebuilt[selected]
    observations = []
    for donor in donors[:4]:
        if (not _valid_image(donor.original, original.shape) or not _valid_image(donor.guide, original.shape)
                or donor.excluded.shape != shape):
            raise ValueError("invalid donor geometry")
        warped, visible, score = _observations(original, guide, excluded, donor)
        report["donors"] += 1
        report["accepted_observations"] += int(np.count_nonzero(visible & selected))
        observations.append((warped, visible, score))
    best = np.full(shape, np.inf, np.float32)
    chosen = rebuilt.copy()
    # Two distinct observations must agree in RGB, not merely in flow.
    for i, (warped, visible, score) in enumerate(observations):
        agrees = np.zeros(shape, bool)
        for j, (other, other_visible, _) in enumerate(observations):
            if i != j:
                agrees |= other_visible & (np.max(np.abs(warped.astype(np.int16) - other.astype(np.int16)), axis=2) <= 8)
        take = visible & agrees & selected & (score < best)
        best[take], chosen[take] = score[take], warped[take]
    consensus = np.isfinite(best) & selected
    report["consensus_pixels"] = int(consensus.sum())
    if not consensus.any():
        report["fallback"] = "no_two_donor_consensus"
        return baseline, baseline.copy(), report

    # Only original background confirmed by donors can soften the mask.
    clean = consensus & (excluded == 0)
    clean &= np.max(np.abs(original.astype(np.int16) - chosen.astype(np.int16)), axis=2) <= 6
    distance = cv2.distanceTransform((excluded == 0).astype(np.uint8), cv2.DIST_L2, 5)
    original_alpha = np.clip(distance / 6, 0, 1) * clean
    mask_only = np.clip(np.rint(baseline * (1 - original_alpha[..., None])
                       + original * original_alpha[..., None]), 0, 255).astype(np.uint8)
    report["original_pixels_recovered"] = int(np.count_nonzero(np.any(mask_only != baseline, axis=2)))

    # A spatial ramp prevents a hard border where visibility stops. The donor
    # supplies actual structure/texture; there is no generated grain/sharpening.
    interior = cv2.distanceTransform(consensus.astype(np.uint8), cv2.DIST_L2, 5)
    alpha = np.clip(interior / 6, 0, 1) * .9
    alpha[clean] = 0  # Prefer the original frame wherever it was verified clean.
    result = np.clip(np.rint(mask_only * (1 - alpha[..., None]) + chosen * alpha[..., None]), 0, 255).astype(np.uint8)
    result[~selected] = original[~selected]
    report["donor_pixels_changed"] = int(np.count_nonzero(np.any(result != mask_only, axis=2)))
    return mask_only, result, report
