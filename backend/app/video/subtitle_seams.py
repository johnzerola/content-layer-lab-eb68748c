"""Bounded screened-Poisson colour correction from safe exterior pixels only.

Solve a screened harmonic correction to the reconstruction, keeping its image
gradients. Original pixels under the removal mask never enter the solve.
"""
import cv2
import numpy as np


def correct_seam(original, native, baseline, selected, excluded):
    shape = original.shape
    if (len(shape) != 3 or shape[2] != 3 or any(a.dtype != np.uint8 or a.shape != shape for a in (original, native, baseline))
            or selected.shape != shape[:2] or excluded.shape != shape[:2]):
        raise ValueError("invalid seam inputs")
    if shape[0] * shape[1] > 1_048_576 or max(shape[:2]) > 1536:
        raise ValueError("seam crop exceeds resource budget")
    inside = selected > 0
    result = baseline.copy()
    stats = {"boundary_samples": 0, "changed_pixels": 0, "max_delta": 0}
    if not inside.any():
        return result, stats
    outside = (cv2.dilate(inside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~inside & (excluded == 0)
    difference = original.astype(np.float32) - native.astype(np.float32)
    # Large differences imply geometry/occlusion, not a correctable colour seam.
    outside &= np.max(np.abs(difference), axis=2) <= 24
    stats['boundary_samples'] = int(outside.sum())
    if outside.sum() < 24:
        return result, stats
    fixed = np.zeros(shape, np.float32)
    fixed[outside] = np.clip(difference[outside], -10, 10)
    delta = fixed.copy()
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    for _ in range(80):
        average = cv2.filter2D(delta, -1, kernel, borderType=cv2.BORDER_CONSTANT) / 1.03
        delta[inside] = average[inside]
    adjusted = np.clip(np.rint(baseline.astype(np.float32) + delta), 0, 255).astype(np.uint8)
    result[inside] = adjusted[inside]
    change = np.abs(result.astype(np.int16) - baseline.astype(np.int16))
    stats.update(changed_pixels=int(np.any(change > 0, axis=2).sum()), max_delta=int(change.max()))
    return result, stats
