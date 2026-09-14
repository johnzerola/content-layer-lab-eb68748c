import json
from pathlib import Path
import sys

import numpy as np
from scipy.io import wavfile


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from evaluate_real_audio_engine_run import evaluate_run


def write_wav(path: Path, pcm: np.ndarray, rate: int = 8_000) -> None:
    wavfile.write(path, rate, pcm.astype(np.float32))


def test_evaluate_real_run_reports_alignment_and_exact_reconstruction(tmp_path: Path):
    source = np.column_stack((np.linspace(-0.5, 0.5, 80), np.linspace(0.5, -0.5, 80)))
    dialogue = source * 0.75
    music = source * 0.25
    write_wav(tmp_path / "source.wav", source)
    write_wav(tmp_path / "dialogue.wav", dialogue)
    write_wav(tmp_path / "music.wav", music)
    run_report = tmp_path / "run-report.json"
    run_report.write_text(json.dumps({
        "recipe": "test-recipe",
        "input": {"path": str(tmp_path / "source.wav")},
        "outputs": {
            "dialogue": {"path": str(tmp_path / "dialogue.wav")},
            "music": {"path": str(tmp_path / "music.wav")},
        },
        "engine_report": {
            "processing_seconds": 0.02,
            "device_detected": "cuda",
            "device_name": "test-gpu",
            "peak_vram_allocated_mib": 123.0,
        },
    }), encoding="utf-8")

    report, passed = evaluate_run(run_report)

    assert passed is True
    assert report["engineering_contract"]["passed"] is True
    assert report["sum_relative_error"] < 1e-6
    assert report["rtf"] == 2.0
    assert report["peak_vram_allocated_mib"] == 123.0
    assert report["quality"] == "PENDING_HUMAN_LISTENING"


def test_evaluate_real_run_fails_mismatched_stem_shape(tmp_path: Path):
    source = np.zeros((80, 2), dtype=np.float32)
    write_wav(tmp_path / "source.wav", source)
    write_wav(tmp_path / "dialogue.wav", source[:-1])
    write_wav(tmp_path / "music.wav", source)
    run_report = tmp_path / "run-report.json"
    run_report.write_text(json.dumps({
        "input": {"path": str(tmp_path / "source.wav")},
        "outputs": {
            "dialogue": {"path": str(tmp_path / "dialogue.wav")},
            "music": {"path": str(tmp_path / "music.wav")},
        },
        "engine_report": {"processing_seconds": 0.01},
    }), encoding="utf-8")

    report, passed = evaluate_run(run_report)

    assert passed is False
    assert report["engineering_contract"]["passed"] is False
    assert report["sum_relative_error"] is None
