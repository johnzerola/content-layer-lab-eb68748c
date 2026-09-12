"""Strict RGB composition for the experimental preservation validation route."""
from itertools import zip_longest
from pathlib import Path

import cv2
import numpy as np

from .inference_region import _write_video, _check_cancel
from ..utils.video import read_frames


def composite_lossless(original, reconstructed, masks, destination, info, cancel_file=None):
    target = Path(destination).resolve()
    if target in (Path(original).resolve(), Path(reconstructed).resolve()):
        raise ValueError("composite must not overwrite inputs")
    expected = {f"{i:06d}.png" for i in range(info.frames)}
    if {p.name for p in Path(masks).iterdir()} != expected:
        raise ValueError("invalid composite mask sequence")
    def frames():
        source, model = read_frames(str(original)), read_frames(str(reconstructed))
        count = 0
        try:
            for i, (a, b) in enumerate(zip_longest(source, model)):
                _check_cancel(cancel_file)
                shape = (info.height, info.width, 3)
                if a is None or b is None or a.shape != shape or b.shape != shape or i >= info.frames:
                    raise ValueError("composite frame count or geometry mismatch")
                mask = cv2.imread(str(Path(masks) / f"{i:06d}.png"), 0)
                if mask is None or mask.shape != shape[:2]:
                    raise ValueError("invalid composite mask geometry")
                # Integer blend preserves both endpoints exactly, including
                # every original pixel outside the supplied mask.
                alpha = mask.astype(np.uint32)[..., None]
                yield ((a.astype(np.uint32) * (255 - alpha) + b.astype(np.uint32) * alpha + 127) // 255).astype(np.uint8)
                count += 1
            if count != info.frames:
                raise ValueError("incomplete composite")
        finally:
            source.close()
            model.close()
    _write_video(target, info.width, info.height, info.fps, frames())
    return str(target)
