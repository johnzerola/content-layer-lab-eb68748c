"""Create local phase-1 detail sheets with estimated Vmake frame alignment."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2
import numpy as np
from PIL import Image, ImageDraw
from app.utils.video import read_frames, probe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("v3", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--candidate-file", default="output-crf14.mp4")
    parser.add_argument("--baseline-file", type=Path)
    parser.add_argument("--label", default="Fase 1 CRF 14")
    parser.add_argument("--prefix", default="")
    args = parser.parse_args()
    groups = {"janela": [30, 50, 60, 70, 73], "fivela": [75, 85, 90, 100, 103],
              "tecido": [106, 115, 120, 130, 140]}
    indices = {i for values in groups.values() for i in values}
    paths = {"Original": args.v3 / "input.mp4", "V3": args.baseline_file or args.v3 / "output.mp4",
             args.label: args.candidate / args.candidate_file, "Vmake": args.v3 / "reference.mp4"}
    patches, features = {}, {}
    for label, path in paths.items():
        info = probe(str(path))
        if ((info.width, info.height) != (1080, 1920)
                or (label != "Vmake" and info.frames != 147)
                or (label == "Vmake" and not 143 <= info.frames <= 151)):
            raise ValueError("detail sheets are calibrated for the reviewed 147-frame sample")
        patches[label], features[label] = {}, []
        stream = read_frames(str(path))
        try:
            for i, frame in enumerate(stream):
                if i in indices or label == "Vmake":
                    patches[label][i] = frame[1330:1560, 150:930].copy()
                # Filmed area above subtitles. Normalize appearance, then find
                # nearby frames; this estimates alignment, never clean truth.
                feature = cv2.resize(cv2.cvtColor(frame[650:1250, 220:900], cv2.COLOR_BGR2GRAY), (64, 64)).astype(np.float32)
                feature = (feature - feature.mean()) / max(1., float(feature.std()))
                features[label].append(feature)
        finally:
            stream.close()
    mapping = {}
    for i in sorted(indices):
        distances = [(float(np.mean((features["Original"][i] - features["Vmake"][j])**2)), j)
                     for j in range(max(0, i - 4), min(len(features["Vmake"]), i + 5))]
        score, j = min(distances)
        mapping[i] = {"reference_frame": j, "normalized_mse": score}
    for name, values in groups.items():
        canvas = Image.new("RGB", (2340, len(values) * 258), "#17191b")
        draw = ImageDraw.Draw(canvas)
        for row, i in enumerate(values):
            for col, label in enumerate(("V3", args.label, "Vmake")):
                j = mapping[i]["reference_frame"] if label == "Vmake" else i
                draw.text((col * 780 + 8, row * 258 + 6), f"{label} | quadro {j}", fill="white")
                rgb = cv2.cvtColor(patches[label][j], cv2.COLOR_BGR2RGB)
                canvas.paste(Image.fromarray(rgb), (col * 780, row * 258 + 24))
        canvas.save(args.candidate / f"{args.prefix}{name}.png")
    (args.candidate / f"{args.prefix}alignment.json").write_text(json.dumps({
        "method": "estimated nearest normalized grayscale ROI, +/-4 frames, above subtitle region",
        "caution": "Inspect alignment visually. Vmake is not ground truth. No quality percentage inferred.",
        "frames": mapping, "detail_crop_xyxy": [150, 1330, 930, 1560],
        "alignment_crop_xyxy": [220, 650, 900, 1250],
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
