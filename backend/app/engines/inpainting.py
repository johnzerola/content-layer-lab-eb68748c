"""Local temporal restoration used only by the explicit fast/fallback mode."""
from __future__ import annotations

import gc
from typing import List, Optional

import cv2
import numpy as np

try:
    import torch
except Exception:  # pragma: no cover
    torch = None  # type: ignore


def cuda_available() -> bool:
    return bool(torch and torch.cuda.is_available())


def device_name() -> str:
    if cuda_available():
        return torch.cuda.get_device_name(0)  # type: ignore[union-attr]
    return "cpu"


def empty_cache() -> None:
    if cuda_available():
        torch.cuda.empty_cache()  # type: ignore[union-attr]
    gc.collect()


def patch_fill(image: np.ndarray, hole: np.ndarray, patch: int = 13, search: int = 96) -> np.ndarray:
    """Fast spatial fallback for pixels with no usable temporal reference."""
    if hole.max() == 0:
        return image
    out = image.copy()
    remaining = (hole > 0).astype(np.uint8) * 255
    restored = cv2.inpaint(out, remaining, 2, cv2.INPAINT_NS)
    out[remaining > 0] = restored[remaining > 0]
    return out


class InpaintingEngine:
    name = "base"

    def process(
        self,
        frames: np.ndarray,
        masks: np.ndarray,
        target_start: int = 0,
        target_end: int | None = None,
    ) -> np.ndarray:
        raise NotImplementedError


class TemporalFillEngine(InpaintingEngine):
    """Align neighboring frames and copy real background pixels into holes."""

    name = "temporal-fill"

    def __init__(self, context_radius: int = 12, max_neighbors: int = 4):
        self.context_radius = context_radius
        self.max_neighbors = max(1, max_neighbors)

    def process(
        self,
        frames: np.ndarray,
        masks: np.ndarray,
        target_start: int = 0,
        target_end: int | None = None,
    ) -> np.ndarray:
        if len(frames) == 0 or not np.any(masks):
            return frames.copy()

        active = np.any(masks > 0, axis=0)
        ys, xs = np.where(active)
        margin = 32
        height, width = active.shape
        y0 = max(0, int(ys.min()) - margin)
        y1 = min(height, int(ys.max()) + margin + 1)
        x0 = max(0, int(xs.min()) - margin)
        x1 = min(width, int(xs.max()) + margin + 1)

        output = frames.copy()
        restored = self._process_region(
            frames[:, y0:y1, x0:x1],
            masks[:, y0:y1, x0:x1],
            target_start,
            target_end,
        )
        output[:, y0:y1, x0:x1] = restored
        return output

    def _process_region(
        self,
        frames: np.ndarray,
        masks: np.ndarray,
        target_start: int = 0,
        target_end: int | None = None,
    ) -> np.ndarray:
        count = len(frames)
        target_start = max(0, min(count, target_start))
        target_end = count if target_end is None else max(target_start, min(count, target_end))
        grays = [cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in frames]
        output = [frame.copy() for frame in frames]
        height, width = grays[0].shape
        grid_x, grid_y = np.meshgrid(
            np.arange(width, dtype=np.float32),
            np.arange(height, dtype=np.float32),
        )
        for index in range(target_start, target_end):
            remaining = masks[index].copy()
            if remaining.max() == 0:
                continue
            current = output[index]
            neighbors = []
            preferred = (1, 16, 32, 8, 24, 4)
            radii = [radius for radius in preferred if radius <= self.context_radius]
            radii.extend(
                radius for radius in range(1, self.context_radius + 1) if radius not in radii
            )
            for radius in radii:
                neighbors.extend((index - radius, index + radius))
            used_neighbors = 0
            for neighbor in neighbors:
                if neighbor < 0 or neighbor >= count or remaining.max() == 0:
                    continue
                potential = cv2.bitwise_and(remaining, cv2.bitwise_not(masks[neighbor]))
                if potential.max() == 0:
                    continue
                current_gray, neighbor_gray, scale_x, scale_y = self._flow_inputs(
                    grays[index], grays[neighbor]
                )
                flow = cv2.calcOpticalFlowFarneback(
                    current_gray, neighbor_gray, None, 0.5, 2, 15, 2, 5, 1.1, 0
                )
                if flow.shape[:2] != (height, width):
                    flow = cv2.resize(flow, (width, height), interpolation=cv2.INTER_LINEAR)
                    flow[..., 0] *= scale_x
                    flow[..., 1] *= scale_y
                warped = cv2.remap(
                    frames[neighbor],
                    grid_x + flow[..., 0],
                    grid_y + flow[..., 1],
                    cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_REPLICATE,
                )
                warped_mask = cv2.remap(
                    masks[neighbor],
                    grid_x + flow[..., 0],
                    grid_y + flow[..., 1],
                    cv2.INTER_NEAREST,
                    borderMode=cv2.BORDER_CONSTANT,
                )
                usable = cv2.bitwise_and(remaining, cv2.bitwise_not(warped_mask))
                selected = usable > 0
                current[selected] = warped[selected]
                remaining[selected] = 0
                used_neighbors += 1
                if used_neighbors >= self.max_neighbors:
                    break
            if remaining.max() > 0:
                current = patch_fill(current, remaining)
            output[index] = current
        return np.asarray(output)

    @staticmethod
    def _flow_inputs(
        current: np.ndarray, neighbor: np.ndarray, max_side: int = 320
    ) -> tuple[np.ndarray, np.ndarray, float, float]:
        height, width = current.shape
        largest = max(height, width)
        if largest <= max_side:
            return current, neighbor, 1.0, 1.0
        ratio = max_side / largest
        small_width = max(32, int(round(width * ratio)))
        small_height = max(32, int(round(height * ratio)))
        return (
            cv2.resize(current, (small_width, small_height), interpolation=cv2.INTER_AREA),
            cv2.resize(neighbor, (small_width, small_height), interpolation=cv2.INTER_AREA),
            width / small_width,
            height / small_height,
        )


def process_windowed(
    engine: InpaintingEngine,
    frames: List[np.ndarray],
    masks: np.ndarray,
    chunk: int = 80,
    overlap: int = 16,
    on_progress=None,
) -> List[np.ndarray]:
    total = len(frames)
    output: List[Optional[np.ndarray]] = [None] * total
    start = 0
    while start < total:
        end = min(total, start + chunk)
        context_start = max(0, start - overlap)
        context_end = min(total, end + overlap)
        result = engine.process(
            np.asarray(frames[context_start:context_end]), masks[context_start:context_end]
        )
        for index in range(start, end):
            output[index] = result[index - context_start]
        if on_progress:
            on_progress(end / total)
        start = end
    return [frame if frame is not None else frames[index] for index, frame in enumerate(output)]
