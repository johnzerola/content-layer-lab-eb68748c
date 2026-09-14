from pathlib import Path
import json
import sys

import numpy as np
from scipy.io import wavfile


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from generate_audio_tts_benchmark import RATE, accompaniment, conversation, fade, main


def test_conversation_and_music_are_aligned_stereo():
    first = np.linspace(-1, 1, RATE // 10)
    second = np.linspace(1, -1, RATE // 12)
    dialogue = conversation(first, second)
    music = accompaniment(len(dialogue))

    assert dialogue.ndim == music.ndim == 2
    assert dialogue.shape == music.shape
    assert dialogue.shape[1] == 2
    assert np.max(np.abs(dialogue)) <= 0.71
    assert np.isfinite(music).all()


def test_fade_avoids_hard_edges():
    pcm = fade(np.ones(RATE // 10))
    assert pcm[0] == 0
    assert pcm[-1] == 0
    assert pcm[len(pcm) // 2] == 1


def test_cli_records_human_source_metadata(tmp_path, monkeypatch):
    speaker_a = tmp_path / "a.wav"
    speaker_b = tmp_path / "b.wav"
    wavfile.write(speaker_a, RATE, np.sin(np.linspace(0, 20, RATE)).astype(np.float32))
    wavfile.write(speaker_b, RATE, np.sin(np.linspace(0, 30, RATE)).astype(np.float32))
    output = tmp_path / "fixtures"
    monkeypatch.setattr(sys, "argv", [
        "generate_audio_tts_benchmark.py",
        "--speaker-a", str(speaker_a),
        "--speaker-b", str(speaker_b),
        "--output", str(output),
        "--fixture-prefix", "human-dialogue",
        "--scope", "LICENSED_HUMAN_SPEECH_ENGINEERING",
        "--human-speech",
        "--speech-source", "licensed source",
        "--license", "CC BY 4.0",
        "--limitation", "read speech",
    ])

    assert main() == 0
    manifest = json.loads((output / "fixture-manifest.json").read_text(encoding="utf-8"))
    assert manifest["human_speech"] is True
    assert manifest["scope"] == "LICENSED_HUMAN_SPEECH_ENGINEERING"
    assert manifest["fixtures"][0]["id"] == "human-dialogue--15"
    assert manifest["license"] == "CC BY 4.0"
    assert manifest["limitations"] == ["read speech"]
    assert len(manifest["input_sources"]) == 2
    assert all(len(item["sha256"]) == 64 for item in manifest["input_sources"])
