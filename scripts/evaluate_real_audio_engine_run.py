"""Measure integrity and runtime for a real audio separation smoke without GT.

This report deliberately does not score semantic separation.  It only proves
that the source and both returned stems are decodable, aligned and reconstruct
the input within a measurable error.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile


ROOT = Path(__file__).resolve().parents[1]


def resolve_report_path(value: str, report_path: Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    repository_candidate = (ROOT / path).resolve()
    if repository_candidate.exists():
        return repository_candidate
    return (report_path.parent / path).resolve()


def read_pcm(path: Path) -> tuple[int, np.ndarray]:
    rate, pcm = wavfile.read(path)
    if pcm.ndim == 1:
        pcm = pcm[:, None]
    if np.issubdtype(pcm.dtype, np.integer):
        info = np.iinfo(pcm.dtype)
        scale = float(max(abs(info.min), info.max))
        pcm = pcm.astype(np.float64) / scale
    else:
        pcm = pcm.astype(np.float64)
    return int(rate), pcm


def rms(pcm: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(pcm)))) if pcm.size else 0.0


def peak(pcm: np.ndarray) -> float:
    return float(np.max(np.abs(pcm))) if pcm.size else 0.0


def relative_error(actual: np.ndarray, expected: np.ndarray) -> float:
    denominator = float(np.linalg.norm(expected))
    if denominator == 0.0:
        return 0.0 if float(np.linalg.norm(actual)) == 0.0 else float("inf")
    return float(np.linalg.norm(actual - expected) / denominator)


def correlation(left: np.ndarray, right: np.ndarray) -> float | None:
    left_flat = left.reshape(-1)
    right_flat = right.reshape(-1)
    if left_flat.size < 2 or np.std(left_flat) == 0 or np.std(right_flat) == 0:
        return None
    return float(np.corrcoef(left_flat, right_flat)[0, 1])


def evaluate_run(run_report_path: Path) -> tuple[dict, bool]:
    run = json.loads(run_report_path.read_text(encoding="utf-8"))
    paths = {
        "source": resolve_report_path(run["input"]["path"], run_report_path),
        "dialogue": resolve_report_path(run["outputs"]["dialogue"]["path"], run_report_path),
        "music": resolve_report_path(run["outputs"]["music"]["path"], run_report_path),
    }
    decoded = {name: read_pcm(path) for name, path in paths.items()}
    rates = {name: rate for name, (rate, _pcm) in decoded.items()}
    samples = {name: int(pcm.shape[0]) for name, (_rate, pcm) in decoded.items()}
    channels = {name: int(pcm.shape[1]) for name, (_rate, pcm) in decoded.items()}
    durations = {
        name: samples[name] / rates[name] if rates[name] else 0.0
        for name in decoded
    }
    engineering_ok = len(set(rates.values())) == 1 and len(set(samples.values())) == 1 and len(set(channels.values())) == 1

    source = decoded["source"][1]
    dialogue = decoded["dialogue"][1]
    music = decoded["music"][1]
    if engineering_ok:
        sum_relative_error = relative_error(dialogue + music, source)
        stem_correlation = correlation(dialogue, music)
    else:
        sum_relative_error = None
        stem_correlation = None

    processing_seconds = float(run.get("engine_report", {}).get("processing_seconds", 0.0))
    source_duration = durations["source"]
    report = {
        "schema_version": 1,
        "classification": "REAL_SMOKE_NO_GROUND_TRUTH",
        "recipe": run.get("recipe"),
        "engineering_contract": {
            "passed": engineering_ok,
            "sample_rates": rates,
            "samples": samples,
            "channels": channels,
            "duration_seconds": durations,
        },
        "rms": {name: rms(pcm) for name, (_rate, pcm) in decoded.items()},
        "peak": {name: peak(pcm) for name, (_rate, pcm) in decoded.items()},
        "sum_relative_error": sum_relative_error,
        "stem_correlation": stem_correlation,
        "processing_seconds": processing_seconds,
        "rtf": processing_seconds / source_duration if source_duration else None,
        "device": run.get("engine_report", {}).get("device_detected"),
        "device_name": run.get("engine_report", {}).get("device_name"),
        "peak_vram_allocated_mib": run.get("engine_report", {}).get("peak_vram_allocated_mib"),
        "quality": "PENDING_HUMAN_LISTENING",
        "interpretation": "No clean stems exist for this real clip; integrity metrics do not prove semantic dialogue/music separation.",
    }
    return report, engineering_ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-report", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    report, engineering_ok = evaluate_run(args.run_report.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0 if engineering_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
