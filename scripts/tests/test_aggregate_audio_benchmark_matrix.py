import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from aggregate_audio_benchmark_matrix import aggregate


def _write_run(root: Path, directory: str, fixture: str, seconds: float, score: float, peak=None):
    target = root / directory
    target.mkdir(parents=True)
    metrics = {
        "fixture": fixture,
        "engineering_contract": {"passed": True},
        "dialogue": {"valid": True, "si_sdr_db": score, "relative_error": 0.1},
        "music": {"valid": True, "si_sdr_db": score + 1, "relative_error": 0.1},
        "reconstruction": {"valid": True, "si_sdr_db": score + 2, "relative_error": 0.1},
    }
    engine = {"processing_seconds": seconds}
    if peak is not None:
        engine["peak_vram_allocated_mib"] = peak
    (target / "metrics.json").write_text(json.dumps(metrics), encoding="utf-8")
    (target / "run-report.json").write_text(json.dumps({"engine_report": engine}), encoding="utf-8")


def test_aggregate_preserves_each_run_and_reports_medians(tmp_path):
    fixtures = []
    for index, ratio in enumerate((-15, 0, 10)):
        fixture = f"fixture-{ratio}"
        fixtures.append({"id": fixture, "dialogue_to_music_db": ratio})
        _write_run(tmp_path, f"b0-{ratio}", fixture, (30, 20, 10)[index], 2 + index)
        _write_run(tmp_path, f"b2-{ratio}", fixture, (10, 40, 5)[index], 8 + index, peak=2048)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({
        "scope": "TEST",
        "human_speech": False,
        "fixtures": fixtures,
        "limitations": ["test"],
    }), encoding="utf-8")

    result = aggregate(tmp_path, manifest)

    assert result["scenario_count"] == 3
    assert result["aggregate"]["processing_seconds_by_arm"]["b2-melband-roformer-cuda"] == [10, 40, 5]
    assert result["aggregate"]["median_processing_seconds"]["b0-htdemucs-cpu"] == 20
    assert result["aggregate"]["median_processing_seconds"]["b2-melband-roformer-cuda"] == 10
    assert result["aggregate"]["b2_quality_wins"] == 6
    assert result["scenarios"][1]["b2_speedup"] == 0.5
    assert result["classification"] == "AUD04_CONTROLLED_TTS_MATRIX"
