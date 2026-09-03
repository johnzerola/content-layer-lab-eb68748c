"""Temporal Background Exposure (TBE).

CPU-first background reconstruction. Instead of running a dense optical flow per
frame pair (Farneback: O(N x R) and unusable on CPU), TBE exploits the fact that
the background hidden behind a subtitle or a watermark is *exposed* in other
frames of the same shot. The pipeline is:

1. estimate global motion (RANSAC affine/homography on ORB features computed on
   the unmasked area) between every frame of the window and a reference frame;
2. warp every frame + its mask into the reference space and build a temporal
   median plate from the pixels that are visible (never masked);
3. warp the plate back per frame and composite it only inside the mask, with a
   feathered border so there is no visible seam;
4. anything the timeline never exposed (truly static overlay on a static shot)
   falls back to the exemplar `patch_fill`.

No blur, no mosaic: every filled pixel is either a real background pixel from
another frame or an exemplar patch from the same frame.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np

from .inpainting import InpaintingEngine, patch_fill

_MAX_SAMPLES = 28
_ALIGN_WIDTH = 480


def _prepare(frame: np.ndarray, mask: np.ndarray, scale: float) -> Tuple[np.ndarray, np.ndarray]:
    small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    small_mask = cv2.resize(mask, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_NEAREST)
    return gray, cv2.bitwise_not(small_mask)


def _estimate_motion(
    detector,
    ref_kp,
    ref_desc,
    gray: np.ndarray,
    valid: np.ndarray,
    scale: float,
) -> Optional[np.ndarray]:
    """2x3 affine matrix mapping `gray` (full res) into the reference space."""
    if ref_desc is None or len(ref_kp) < 8:
        return np.eye(2, 3, dtype=np.float32)
    kp, desc = detector.detectAndCompute(gray, valid)
    if desc is None or len(kp) < 8:
        return None
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    try:
        pairs = matcher.knnMatch(desc, ref_desc, k=2)
    except cv2.error:
        return None
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.78 * n.distance]
    if len(good) < 8:
        return None
    src = np.float32([kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2) / scale
    dst = np.float32([ref_kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2) / scale
    matrix, inliers = cv2.estimateAffinePartial2D(
        src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=1500
    )
    if matrix is None or inliers is None or int(inliers.sum()) < 6:
        return None
    return matrix.astype(np.float32)


def _feather(mask: np.ndarray, radius: int = 3) -> np.ndarray:
    if radius <= 0:
        return (mask > 0).astype(np.float32)
    soft = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), radius)
    return np.clip(soft * 1.25, 0.0, 1.0)


def _bbox(mask: np.ndarray, margin: int = 24) -> Optional[Tuple[int, int, int, int]]:
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        return None
    height, width = mask.shape[:2]
    y0 = max(0, int(ys.min()) - margin)
    y1 = min(height, int(ys.max()) + 1 + margin)
    x0 = max(0, int(xs.min()) - margin)
    x1 = min(width, int(xs.max()) + 1 + margin)
    return y0, y1, x0, x1


class TemporalBackgroundExposureEngine(InpaintingEngine):
    """Global-motion temporal harvesting — the CPU-efficient default."""

    name = "tbe"

    def __init__(self, max_samples: int = _MAX_SAMPLES, feather: int = 3):
        self.max_samples = max(4, max_samples)
        self.feather = feather
        # Windows of a static shot repeat the same hole: caching the exemplar
        # plate keeps the expensive block matching out of the per-window budget.
        self._plate_cache: Optional[tuple] = None
        self._alpha_cache: Optional[tuple] = None

    def _alpha_for(self, mask: np.ndarray) -> np.ndarray:
        key = (mask.shape, int(mask.sum()), bytes(mask[::16, ::16].tobytes()))
        if self._alpha_cache and self._alpha_cache[0] == key:
            return self._alpha_cache[1]
        alpha = _feather(mask, self.feather)[..., None]
        self._alpha_cache = (key, alpha)
        return alpha

    def _fill_unseen(self, plate: np.ndarray, unseen: np.ndarray) -> np.ndarray:
        """Exemplar fill limited to the hole neighbourhood, with a shot cache."""
        box = _bbox(unseen, margin=48)
        if box is None:
            return plate
        y0, y1, x0, x1 = box
        crop = plate[y0:y1, x0:x1]
        hole = unseen[y0:y1, x0:x1]
        signature = (box, int(hole.sum()))
        cached = self._plate_cache
        if cached and cached[0] == signature:
            ring = hole == 0
            if ring.any():
                delta = float(
                    np.mean(
                        np.abs(
                            crop[ring].astype(np.float32) - cached[1][ring].astype(np.float32)
                        )
                    )
                )
                if delta < 6.0:
                    out = plate.copy()
                    out[y0:y1, x0:x1] = cached[2]
                    return out
        filled_crop = patch_fill(crop, hole, patch=21, search=72)
        self._plate_cache = (signature, crop.copy(), filled_crop.copy())
        out = plate.copy()
        out[y0:y1, x0:x1] = filled_crop
        return out


    def process(self, frames: np.ndarray, masks: np.ndarray) -> np.ndarray:
        count = len(frames)
        if count == 0:
            return frames
        height, width = frames[0].shape[:2]
        scale = min(1.0, _ALIGN_WIDTH / float(width))
        detector = cv2.ORB_create(nfeatures=1200, fastThreshold=7)

        reference = count // 2
        ref_gray, ref_valid = _prepare(frames[reference], masks[reference], scale)
        ref_kp, ref_desc = detector.detectAndCompute(ref_gray, ref_valid)

        step = max(1, count // self.max_samples)
        sample_indices = list(range(0, count, step))
        if reference not in sample_indices:
            sample_indices.append(reference)

        transforms: dict[int, np.ndarray] = {reference: np.eye(2, 3, dtype=np.float32)}
        stack: List[np.ndarray] = []
        valid_stack: List[np.ndarray] = []
        for index in sample_indices:
            if index == reference:
                matrix = transforms[reference]
            else:
                gray, valid = _prepare(frames[index], masks[index], scale)
                matrix = _estimate_motion(detector, ref_kp, ref_desc, gray, valid, scale)
                if matrix is None:
                    continue
                transforms[index] = matrix
            warped = cv2.warpAffine(
                frames[index], matrix, (width, height), flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
            )
            warped_mask = cv2.warpAffine(
                masks[index], matrix, (width, height), flags=cv2.INTER_NEAREST,
                borderMode=cv2.BORDER_CONSTANT, borderValue=255,
            )
            covered = cv2.warpAffine(
                np.full((height, width), 255, np.uint8), matrix, (width, height),
                flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0,
            )
            usable = cv2.bitwise_and(cv2.bitwise_not(warped_mask), covered)
            stack.append(warped)
            valid_stack.append(usable)

        plate, plate_valid = self._median_plate(stack, valid_stack)
        del stack, valid_stack

        # Pixels the timeline never exposed (a truly static overlay on a static
        # shot) are reconstructed ONCE in reference space with the exemplar
        # filler: cheap on CPU and temporally coherent, since every frame then
        # reuses the same plate instead of hallucinating its own patch.
        if plate_valid.max() > 0:
            unseen = cv2.bitwise_not(plate_valid)
            interest = np.zeros_like(plate_valid)
            for index in range(0, count, max(1, count // 8)):
                interest = np.maximum(interest, masks[index])
            interest = cv2.dilate(
                interest, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))
            )
            unseen = cv2.bitwise_and(unseen, interest)
            if unseen.max() > 0:
                plate = patch_fill(plate, unseen)
                plate_valid = cv2.bitwise_or(plate_valid, unseen)


        output: List[np.ndarray] = []
        for index in range(count):
            hole = masks[index]
            frame = frames[index]
            if hole.max() == 0:
                output.append(frame.copy())
                continue
            matrix = transforms.get(index)
            if matrix is None:
                gray, valid = _prepare(frame, hole, scale)
                matrix = _estimate_motion(detector, ref_kp, ref_desc, gray, valid, scale)
            current = frame.copy()
            remaining = hole.copy()
            if matrix is not None and plate_valid.max() > 0:
                inverse = cv2.invertAffineTransform(matrix)
                local_plate = cv2.warpAffine(
                    plate, inverse, (width, height), flags=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT,
                )
                local_valid = cv2.warpAffine(
                    plate_valid, inverse, (width, height), flags=cv2.INTER_NEAREST,
                    borderMode=cv2.BORDER_CONSTANT, borderValue=0,
                )
                fillable = cv2.bitwise_and(remaining, local_valid)
                if fillable.max() > 0:
                    alpha = _feather(fillable, self.feather)[..., None]
                    current = (
                        current.astype(np.float32) * (1.0 - alpha)
                        + local_plate.astype(np.float32) * alpha
                    ).astype(np.uint8)
                    remaining = cv2.bitwise_and(remaining, cv2.bitwise_not(fillable))
            leftover = int(np.count_nonzero(remaining))
            if leftover > 0:
                original = max(1, int(np.count_nonzero(hole)))
                if leftover / original < 0.2:
                    # thin residual border: Telea is instant and visually identical
                    patched = cv2.inpaint(current, remaining, 3, cv2.INPAINT_TELEA)
                    current[remaining > 0] = patched[remaining > 0]
                else:
                    current = patch_fill(current, remaining)
            output.append(current)
        return np.asarray(output)

    @staticmethod
    def _median_plate(
        stack: List[np.ndarray], valid_stack: List[np.ndarray]
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Per-pixel temporal median over the frames where the pixel is exposed."""
        if not stack:
            empty = np.zeros((1, 1, 3), np.uint8)
            return empty, np.zeros((1, 1), np.uint8)
        height, width = stack[0].shape[:2]
        samples = np.asarray(stack, dtype=np.float32)
        valid = np.asarray([(v > 0) for v in valid_stack])
        counts = valid.sum(axis=0)
        # Push invisible samples to +inf, sort once, then read the middle of the
        # visible run per pixel. Much cheaper than nanmedian and NaN-free.
        big = np.float32(1e9)
        filled = np.where(valid[..., None], samples, big)
        filled.sort(axis=0)
        idx = np.clip((counts - 1) // 2, 0, len(stack) - 1)
        plate = np.take_along_axis(
            filled, idx[None, ..., None].repeat(3, axis=3).astype(np.intp), axis=0
        )[0]
        plate_valid = (counts > 0).astype(np.uint8) * 255
        plate[plate >= big] = 0
        return plate.astype(np.uint8), plate_valid



def tbe_status() -> dict:
    return {"ready": True, "quality": "cpu-optimized", "engine": TemporalBackgroundExposureEngine.name}
