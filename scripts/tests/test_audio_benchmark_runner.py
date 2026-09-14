from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
import wave

import numpy as np
import pytest
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark_audio_separation import load_manifest, run_fixture


FAKE_ENGINE = Path(__file__).with_name("fake_audio_engine.py")


def make_wav(path: Path, rate: int = 44_100, channels: int = 2) -> None:
    frames = b"".join(struct.pack("<h", 500 if index % 2 else -500)
                      for index in range(rate // 20 * channels))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(frames)


def recipe(timeout: float = 15) -> dict[str, object]:
    return {"id": "b0", "model": "htdemucs", "device": "cpu",
            "timeout_seconds": timeout, "shifts": 0, "segment": 7,
            "overlap": 0.25}


def command(mode: str):
    return lambda source, output, settings: [
        sys.executable, str(FAKE_ENGINE), mode, str(source), str(output),
        str(settings["model"]),
    ]


def test_manifest_requires_hash_and_allowlisted_recipe(tmp_path: Path) -> None:
    source = tmp_path / "input.wav"
    make_wav(source)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({
        "schema_version": 1,
        "fixtures": [{"id": "fixture", "files": {"input": {
            "path": "input.wav", "sha256": digest}}}],
        "recipes": [recipe()],
    }), encoding="utf-8")
    fixtures, recipes = load_manifest(manifest)
    assert fixtures[0]["source"] == source.resolve()
    assert recipes[0]["model"] == "htdemucs"
    manifest.write_text(manifest.read_text().replace(digest, "0" * 64), encoding="utf-8")
    with pytest.raises(ValueError, match="FIXTURE_HASH_OR_FILE_INVALID"):
        load_manifest(manifest)


@pytest.mark.parametrize(
    ("mode", "status"),
    [("valid", "TECHNICAL_PASS"), ("missing", "OUTPUT_INVALID"),
     ("bad-rate", "OUTPUT_INVALID"), ("failure", "PROCESS_FAILED")],
)
def test_runner_validates_process_and_outputs(
    tmp_path: Path, mode: str, status: str,
) -> None:
    source = tmp_path / "input.wav"
    make_wav(source)
    result = run_fixture({"id": "fixture", "source": source}, recipe(),
                         tmp_path / "runs", command(mode))
    assert result["status"] == status
    assert result["quality_status"] == "NOT_EVALUATED"
    if status == "TECHNICAL_PASS":
        assert result["artifacts"]["stems"]["dialogue"]["channels"] == 2


def test_runner_times_out_and_stops_process(tmp_path: Path) -> None:
    source = tmp_path / "input.wav"
    make_wav(source)
    result = run_fixture({"id": "fixture", "source": source}, recipe(0.05),
                         tmp_path / "runs", command("timeout"))
    assert result["status"] == "TIMEOUT"
    assert result["returncode"] == -1


@pytest.mark.parametrize(("rate", "channels"), [(48_000, 1), (48_000, 2)])
def test_runner_preserves_native_rate_and_channels(
    tmp_path: Path, rate: int, channels: int,
) -> None:
    source = tmp_path / "input.wav"
    make_wav(source, rate=rate, channels=channels)
    result = run_fixture({"id": "native", "source": source}, recipe(),
                         tmp_path / "runs", command("valid"))
    assert result["status"] == "TECHNICAL_PASS"
    assert result["artifacts"]["stems"]["dialogue"]["sample_rate"] == rate
    assert result["artifacts"]["stems"]["dialogue"]["channels"] == channels


def test_runner_reports_ground_truth_metrics_without_approving_quality(
    tmp_path: Path,
) -> None:
    rate = 8_000
    time = np.arange(rate // 10) / rate
    dialogue = (0.1 * np.sin(2 * np.pi * 200 * time))[:, None].astype(np.float32)
    music = (0.1 * np.sin(2 * np.pi * 700 * time))[:, None].astype(np.float32)
    source, dialogue_path, music_path = (tmp_path / name for name in
                                         ("input.wav", "dialogue.wav", "music.wav"))
    wavfile.write(source, rate, dialogue + music)
    wavfile.write(dialogue_path, rate, dialogue)
    wavfile.write(music_path, rate, music)

    def oracle(source_file, output, settings):
        root = output / str(settings["model"]) / source_file.stem
        root.mkdir(parents=True)
        (root / "vocals.wav").write_bytes(dialogue_path.read_bytes())
        (root / "no_vocals.wav").write_bytes(music_path.read_bytes())
        return [sys.executable, "-c", "raise SystemExit(0)"]

    result = run_fixture({"id": "oracle", "source": source,
                          "ground_truth": {"dialogue": dialogue_path,
                                           "music": music_path}},
                         recipe(), tmp_path / "runs", oracle)
    metrics = result["artifacts"]["ground_truth_metrics"]
    assert result["status"] == "TECHNICAL_PASS"
    assert result["quality_status"] == "NOT_EVALUATED"
    assert metrics["status"] == "METRICS_ONLY_NOT_PERCEPTUAL"
    assert metrics["dialogue"]["relative_error"] == pytest.approx(0)
    assert metrics["reconstruction"]["relative_error"] == pytest.approx(0)
