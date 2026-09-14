"""Evaluate an AUD-03 engine run against a controlled fixture with ground truth."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
from scipy.io import wavfile


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from audio_benchmark_controls import evaluate


def resolve_path(value: str, owner: Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (owner.parent / path).resolve()


def read_pcm(path: Path) -> tuple[int, np.ndarray]:
    rate, pcm = wavfile.read(path)
    if pcm.ndim == 1:
        pcm = pcm[:, None]
    if np.issubdtype(pcm.dtype, np.integer):
        limit = float(max(abs(np.iinfo(pcm.dtype).min), np.iinfo(pcm.dtype).max))
        pcm = pcm.astype(np.float64) / limit
    else:
        pcm = pcm.astype(np.float64)
    return int(rate), pcm


def classify_manifest(manifest: dict) -> tuple[str, str]:
    if manifest.get("human_speech"):
        return (
            "CONTROLLED_HUMAN_SPEECH_BENCHMARK",
            "Licensed human speech and generated music measure controlled source separation. Read speech and synthetic accompaniment do not approve spontaneous conversation, real rooms or real songs.",
        )
    if manifest.get("speech_like"):
        return (
            "CONTROLLED_TTS_BENCHMARK",
            "Synthetic speech and generated music measure controlled source separation, but do not approve natural human dialogue, microphones or real songs.",
        )
    return (
        "TECHNICAL_SMOKE_ONLY",
        "These mathematical tones validate the pipeline only; they do not approve human dialogue separation.",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-report", required=True, type=Path)
    parser.add_argument("--fixture-manifest", required=True, type=Path)
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    run = json.loads(args.run_report.read_text(encoding="utf-8"))
    manifest = json.loads(args.fixture_manifest.read_text(encoding="utf-8"))
    fixture = next(item for item in manifest["fixtures"] if item["id"] == args.fixture)

    paths = {
        "dialogue_estimate": resolve_path(run["outputs"]["dialogue"]["path"], ROOT / "placeholder"),
        "music_estimate": resolve_path(run["outputs"]["music"]["path"], ROOT / "placeholder"),
        "dialogue_truth": resolve_path(fixture["files"]["dialogue"]["path"], args.fixture_manifest),
        "music_truth": resolve_path(fixture["files"]["music"]["path"], args.fixture_manifest),
        "input_truth": resolve_path(fixture["files"]["input"]["path"], args.fixture_manifest),
    }
    decoded = {name: read_pcm(path) for name, path in paths.items()}
    rates = {rate for rate, _pcm in decoded.values()}
    shapes = {pcm.shape for _rate, pcm in decoded.values()}
    engineering_ok = len(rates) == 1 and len(shapes) == 1

    if engineering_ok:
        dialogue = decoded["dialogue_estimate"][1]
        music = decoded["music_estimate"][1]
        dialogue_truth = decoded["dialogue_truth"][1]
        music_truth = decoded["music_truth"][1]
        input_truth = decoded["input_truth"][1]
        dialogue_metrics = evaluate(dialogue, dialogue_truth)
        music_metrics = evaluate(music, music_truth)
        reconstruction = evaluate(dialogue + music, input_truth)
    else:
        dialogue_metrics = {"valid": False, "si_sdr_db": None, "relative_error": None}
        music_metrics = {"valid": False, "si_sdr_db": None, "relative_error": None}
        reconstruction = {"valid": False, "si_sdr_db": None, "relative_error": None}

    speech_like = bool(manifest.get("speech_like"))
    classification, interpretation = classify_manifest(manifest)
    report = {
        "schema_version": 1,
        "classification": classification,
        "scope": manifest.get("scope", "UNSPECIFIED"),
        "human_speech": bool(manifest.get("human_speech")),
        "speech_like": speech_like,
        "recipe": run["recipe"],
        "fixture": fixture["id"],
        "engineering_contract": {
            "passed": engineering_ok,
            "sample_rates": sorted(rates),
            "shapes": sorted([list(shape) for shape in shapes]),
        },
        "dialogue": dialogue_metrics,
        "music": music_metrics,
        "reconstruction": reconstruction,
        "interpretation": interpretation,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0 if engineering_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
