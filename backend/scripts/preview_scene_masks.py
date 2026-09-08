"""CPU-only diagnostic: show detected masks; never invokes an inpainting model.

Run with PYTHONPATH=/app and a job containing an input.mp4 of at most 5 seconds.
Outputs are explicitly previews, not videos with removed subtitles.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from app.services.scene import detect_scenes
from app.services.chunking import plan_chunks
from app.utils.video import probe, read_chunk
from app.workers.tasks import auto_detect, _window_masks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job_id")
    parser.add_argument("--storage", default="/app/storage")
    args = parser.parse_args()
    directory = Path(args.storage) / args.job_id
    source = directory / "input.mp4"
    info = probe(str(source))
    if info.duration > 5.1:
        raise ValueError("diagnostico limitado a 5 segundos")
    regions = auto_detect(args.job_id, "smart", samples=6)
    scenes = detect_scenes(str(source))
    chunks = plan_chunks(info.duration, 15, 0.6, [start / info.fps for start, _ in scenes])
    output = directory / "mask-preview"
    output.mkdir(exist_ok=True)
    measurements = []
    for index in sorted({0, info.frames // 2, max(0, info.frames - 2)}):
        frames = read_chunk(str(source), index, 1)
        if not frames:
            continue
        mask = _window_masks(frames, regions, info, "smart", True, 1, index, False)[0]
        frame = frames[0].copy()
        selected = mask > 0
        color = np.array([30, 230, 80], dtype=np.float32)
        frame[selected] = (frame[selected].astype(np.float32) * 0.5 + color * 0.5).astype(np.uint8)
        cv2.putText(frame, "MASK PREVIEW - NOT CLEANED", (24, 40), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imwrite(str(output / f"mask-preview-{index:04d}.jpg"), frame)
        cv2.imwrite(str(output / f"mask-{index:04d}.png"), mask)
        measurements.append({"frame": index, "coverage": float(selected.mean())})
    report = {"kind": "mask_preview_only", "duration": info.duration, "regions": regions,
              "scenes": scenes, "chunks": [vars(chunk) for chunk in chunks], "samples": measurements}
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"kind": report["kind"], "regions": len(regions),
                      "scenes": len(scenes), "samples": measurements}))


if __name__ == "__main__":
    main()
