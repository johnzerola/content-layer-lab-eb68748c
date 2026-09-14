"""Aggregate paired B0/B2 audio-separation runs without hiding per-run variance."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


ARM_DIRS = {
    "b0-htdemucs-cpu": "b0-{suffix}",
    "b2-melband-roformer-cuda": "b2-{suffix}",
}


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _arm_result(root: Path, directory: str) -> dict:
    metrics = _read_json(root / directory / "metrics.json")
    report = _read_json(root / directory / "run-report.json")
    if not metrics.get("engineering_contract", {}).get("passed"):
        raise ValueError(f"engineering contract failed: {directory}")
    seconds = float(report["engine_report"]["processing_seconds"])
    result = {
        "processing_seconds": seconds,
        "dialogue": metrics["dialogue"],
        "music": metrics["music"],
        "reconstruction": metrics["reconstruction"],
    }
    peak = report["engine_report"].get("peak_vram_allocated_mib")
    if peak is not None:
        result["peak_vram_allocated_mib"] = float(peak)
    return result


def aggregate(root: Path, manifest_path: Path) -> dict:
    manifest = _read_json(manifest_path)
    fixtures = {int(item["dialogue_to_music_db"]): item for item in manifest["fixtures"]}
    scenarios = []
    timings = {arm: [] for arm in ARM_DIRS}

    for ratio in sorted(fixtures):
        suffix = str(ratio)
        arms = {
            arm: _arm_result(root, pattern.format(suffix=suffix))
            for arm, pattern in ARM_DIRS.items()
        }
        b0 = arms["b0-htdemucs-cpu"]
        b2 = arms["b2-melband-roformer-cuda"]
        for arm, result in arms.items():
            timings[arm].append(result["processing_seconds"])
        scenarios.append({
            "fixture": fixtures[ratio]["id"],
            "dialogue_to_music_db": ratio,
            "arms": arms,
            "deltas_b2_minus_b0_db": {
                "dialogue_si_sdr": b2["dialogue"]["si_sdr_db"] - b0["dialogue"]["si_sdr_db"],
                "music_si_sdr": b2["music"]["si_sdr_db"] - b0["music"]["si_sdr_db"],
            },
            "b2_speedup": b0["processing_seconds"] / b2["processing_seconds"],
        })

    medians = {arm: statistics.median(values) for arm, values in timings.items()}
    quality_wins = sum(
        scenario["deltas_b2_minus_b0_db"][metric] > 0
        for scenario in scenarios
        for metric in ("dialogue_si_sdr", "music_si_sdr")
    )
    quality_comparisons = len(scenarios) * 2
    human_speech = bool(manifest["human_speech"])
    all_quality_wins = quality_wins == quality_comparisons
    if human_speech:
        classification = "AUD04_CONTROLLED_HUMAN_SPEECH_MATRIX"
        winning_decision = "B2_LEADS_ALL_CONTROLLED_HUMAN_READ_SPEECH_QUALITY_SCENARIOS"
    else:
        classification = "AUD04_CONTROLLED_TTS_MATRIX"
        winning_decision = "B2_LEADS_ALL_CONTROLLED_TTS_QUALITY_SCENARIOS"
    return {
        "schema_version": 2,
        "classification": classification,
        "scope": manifest["scope"],
        "human_speech": human_speech,
        "scenario_count": len(scenarios),
        "scenarios": scenarios,
        "aggregate": {
            "processing_seconds_by_arm": timings,
            "median_processing_seconds": medians,
            "b2_median_speedup": medians["b0-htdemucs-cpu"] / medians["b2-melband-roformer-cuda"],
            "b2_quality_wins": quality_wins,
            "quality_comparisons": quality_comparisons,
        },
        "decision": winning_decision if all_quality_wins else "NO_UNANIMOUS_QUALITY_LEADER",
        "production_model": "NOT_SELECTED",
        "limits": manifest["limitations"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = aggregate(args.root, args.manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(result["aggregate"], allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
