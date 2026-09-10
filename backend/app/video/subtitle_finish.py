"""Conservative finishing of an already reconstructed subtitle region.

Only parameters are shared between frames. No original pixels under the mask,
generated grain, or unregistered pixels from an earlier frame enter the result.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class FinishState:
    """Scene-local parameter history; call reset at a known scene cut."""

    _shift: np.ndarray | None = field(default=None, repr=False)
    _sharpen: float = 0.0
    _mode: str | None = None
    _shape: tuple[int, int] | None = None
    _bounds: tuple[int, int, int, int] | None = None

    def reset(self) -> None:
        self._shift = None
        self._sharpen = 0.0
        self._mode = None
        self._shape = None
        self._bounds = None


def _kernel(radius: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)


def _bounds_overlap(first: tuple, second: tuple) -> float:
    x0, y0 = max(first[0], second[0]), max(first[1], second[1])
    x1, y1 = min(first[2], second[2]), min(first[3], second[3])
    intersection = max(0, x1 - x0) * max(0, y1 - y0)
    a = (first[2] - first[0]) * (first[3] - first[1])
    b = (second[2] - second[0]) * (second[3] - second[1])
    return intersection / max(1, a + b - intersection)


def _boundary_evidence(original: np.ndarray, rebuilt: np.ndarray, mask: np.ndarray):
    """Compare short, locally smooth profiles on each side of the boundary.

    A local linear extrapolation avoids forcing the mean of one object onto
    another. Profiles with edges, curvature, large offsets, or incompatible
    slopes are rejected. Only the accepted portion of the boundary is eligible.
    """
    height, width = mask.shape
    differences, locations = [], []
    tested = 0
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        ys, xs = np.nonzero(mask)
        valid = ((ys + 3 * dy >= 0) & (ys + 3 * dy < height)
                 & (xs + 3 * dx >= 0) & (xs + 3 * dx < width)
                 & (ys - 2 * dy >= 0) & (ys - 2 * dy < height)
                 & (xs - 2 * dx >= 0) & (xs - 2 * dx < width))
        ys, xs = ys[valid], xs[valid]
        eligible = (~mask[ys + dy, xs + dx]
                    & ~mask[ys + 2 * dy, xs + 2 * dx]
                    & ~mask[ys + 3 * dy, xs + 3 * dx]
                    & mask[ys - dy, xs - dx] & mask[ys - 2 * dy, xs - 2 * dx])
        ys, xs = ys[eligible], xs[eligible]
        tested += len(ys)
        if not len(ys):
            continue
        a, b, c = (original[ys + d * dy, xs + d * dx] for d in (1, 2, 3))
        p, q, r = (rebuilt[ys - d * dy, xs - d * dx] for d in (0, 1, 2))
        outer_slope, inner_slope = a - b, q - p
        shift = 2 * a - b - p
        good = ((np.max(np.abs(outer_slope), axis=1) <= 6)
                & (np.max(np.abs(inner_slope), axis=1) <= 6)
                & (np.max(np.abs((b - c) - outer_slope), axis=1) <= 2)
                & (np.max(np.abs((r - q) - inner_slope), axis=1) <= 2)
                & (np.max(np.abs(outer_slope - inner_slope), axis=1) <= 2)
                & (np.max(np.abs(shift), axis=1) <= 8))
        differences.append(shift[good])
        locations.append((ys[good], xs[good]))
    if not differences:
        return None, None, 0
    values = np.concatenate(differences)
    count = len(values)
    if count < 24 or count < tested * 0.6:
        return None, None, count
    shift = np.median(values, axis=0)
    # Inconsistent signs/differences are often an object crossing the mask.
    agreeing = np.max(np.abs(values - shift), axis=1) <= 2
    if np.mean(agreeing) < 0.85 or np.max(np.abs(shift)) < 0.75:
        return None, None, count
    support = np.zeros(mask.shape, np.uint8)
    ys = np.concatenate([item[0] for item in locations])
    xs = np.concatenate([item[1] for item in locations])
    support[ys[agreeing], xs[agreeing]] = 1
    return shift, cv2.dilate(support, _kernel(3)) > 0, count


def finish_frame(
    original: np.ndarray,
    reconstructed: np.ndarray,
    mask: np.ndarray,
    state: FinishState,
    *,
    strength: float = 0.3,
) -> tuple[np.ndarray, dict]:
    """Return a bounded adjustment, preserving original pixels outside mask.

    Same-position exterior samples can justify a small color correction and
    limited sharpening. If that exterior has already been composed from the
    original, only reliable local boundary continuity can justify a correction.
    Ambiguous evidence leaves the reconstruction unchanged. Total change is
    capped at three levels per channel; sharpening adds no new texture.
    """
    if (not isinstance(original, np.ndarray) or original.dtype != np.uint8
            or original.ndim != 3 or original.shape[2] != 3 or not original.shape[0] or not original.shape[1]
            or not isinstance(reconstructed, np.ndarray)
            or reconstructed.dtype != np.uint8 or reconstructed.shape != original.shape):
        raise ValueError("original and reconstructed must be matching uint8 BGR images")
    mask = np.asarray(mask)
    if (mask.shape != original.shape[:2]
            or (not np.issubdtype(mask.dtype, np.number) and mask.dtype != np.bool_)):
        raise ValueError("mask must be a numeric or boolean image matching the crop")
    if not np.all(np.isfinite(mask)) or not np.isfinite(strength):
        raise ValueError("mask and strength must be finite")
    strength = float(np.clip(strength, 0.0, 1.0))
    selected = mask > 0
    result = original.copy()
    result[selected] = reconstructed[selected]
    report = {"applied": False, "reason": "insufficient_evidence", "mode": "none",
              "colour_shift_bgr": [0.0, 0.0, 0.0], "sharpen_amount": 0.0,
              "ring_samples": 0, "boundary_samples": 0, "smoothed": False}
    if not selected.any() or strength == 0:
        state.reset()
        report["reason"] = "empty_mask" if not selected.any() else "disabled"
        return result, report

    ys, xs = np.nonzero(selected)
    bounds = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    if (state._shape != selected.shape or (state._bounds is not None
                                         and _bounds_overlap(state._bounds, bounds) < 0.5)):
        state.reset()
    mask_u8 = selected.astype(np.uint8)
    # Four pixels of exclusion keep the small detail filter away from text.
    ring = ((cv2.dilate(mask_u8, _kernel(12)) > 0)
            & (cv2.dilate(mask_u8, np.ones((9, 9), np.uint8)) == 0))
    count = int(ring.sum())
    report["ring_samples"] = count
    original_f = original.astype(np.float32)
    rebuilt_f = reconstructed.astype(np.float32)
    shift, sharpen, mode, weight = np.zeros(3, np.float32), 0.0, "none", selected.astype(np.float32)

    if count >= 64:
        delta = original_f[ring] - rebuilt_f[ring]
        median = np.median(delta, axis=0)
        errors = np.max(np.abs(delta - median), axis=1)
        # Require agreement at identical scene points, not similar regional means.
        if (np.mean(errors <= 2) >= 0.85 and np.max(np.abs(median)) <= 12
                and np.max(np.abs(median)) >= 0.75):
            shift = median
            mode = "paired_exterior"

        source_gray = cv2.cvtColor(original_f, cv2.COLOR_BGR2GRAY)
        rebuilt_gray = cv2.cvtColor(rebuilt_f, cv2.COLOR_BGR2GRAY)
        source_hp = source_gray - cv2.GaussianBlur(source_gray, (7, 7), 1.0)
        rebuilt_hp = rebuilt_gray - cv2.GaussianBlur(rebuilt_gray, (7, 7), 1.0)
        left, right = source_hp[ring], rebuilt_hp[ring]
        source_energy = float(np.sqrt(np.mean(left * left)))
        rebuilt_energy = float(np.sqrt(np.mean(right * right)))
        correlation = float(np.mean(left * right) / max(1e-6, source_energy * rebuilt_energy))
        ratio = rebuilt_energy / max(1e-6, source_energy)
        # A deficit must exist at the SAME pixels and preserve their structure.
        # A flat or unrelated interior must never be sharpened using ring texture.
        if source_energy >= 1.5 and 0.65 <= ratio <= 0.92 and correlation >= 0.95:
            inner_hp = rebuilt_hp[selected]
            inner_energy = float(np.sqrt(np.mean(inner_hp * inner_hp)))
            if 0.5 * rebuilt_energy <= inner_energy <= 2 * rebuilt_energy:
                sharpen = min(0.2, 1 / ratio - 1)
                mode = "paired_exterior"

    if mode == "none":
        estimate, support, samples = _boundary_evidence(original_f, rebuilt_f, selected)
        report["boundary_samples"] = samples
        if estimate is not None:
            shift = estimate
            mode = "local_boundary"
            distance = cv2.distanceTransform(mask_u8, cv2.DIST_L2, 3)
            weight = np.clip((5.0 - distance) / 4.0, 0.0, 1.0) * support
    if mode == "none":
        # Stale parameters must not leak into an unsupported next frame.
        state.reset()
        return result, report

    shift = np.clip(shift * strength, -3.0, 3.0)
    sharpen *= strength
    if state._shift is not None and state._mode == mode:
        # A missing or reversed current estimate invalidates the old parameter;
        # smoothing must not carry unsupported sharpening/color into a new frame.
        coherent = (shift * state._shift > 0)
        shift = np.where(coherent, 0.7 * state._shift + 0.3 * shift, shift)
        smooth_sharpen = sharpen > 0 and state._sharpen > 0
        if smooth_sharpen:
            sharpen = 0.7 * state._sharpen + 0.3 * sharpen
        report["smoothed"] = bool(np.any(coherent) or smooth_sharpen)
    state._shift = shift.copy()
    state._sharpen = sharpen
    state._mode = mode
    state._shape = selected.shape
    state._bounds = bounds

    adjustment = shift[None, None, :] * weight[..., None]
    if sharpen > 0:
        # This is reconstruction detail, never original text or generated noise.
        highpass = rebuilt_f - cv2.GaussianBlur(rebuilt_f, (7, 7), 1.0)
        interior = cv2.erode(mask_u8, _kernel(2)) > 0
        adjustment += highpass * (interior.astype(np.float32) * sharpen)[..., None]
    adjusted = np.clip(np.rint(rebuilt_f + np.clip(adjustment, -3.0, 3.0)), 0, 255).astype(np.uint8)
    result[selected] = adjusted[selected]
    applied = bool(np.any(result[selected] != reconstructed[selected]))
    report.update(applied=applied, reason="adjusted" if applied else "below_one_level", mode=mode,
                  colour_shift_bgr=[round(float(v), 4) for v in shift],
                  sharpen_amount=round(float(sharpen), 5))
    return result, report
