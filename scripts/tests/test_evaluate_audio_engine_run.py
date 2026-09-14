from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from evaluate_audio_engine_run import classify_manifest


def test_human_speech_is_not_mislabeled_as_tts():
    classification, interpretation = classify_manifest({"human_speech": True, "speech_like": True})
    assert classification == "CONTROLLED_HUMAN_SPEECH_BENCHMARK"
    assert "Licensed human speech" in interpretation


def test_tts_and_tones_keep_distinct_scope():
    assert classify_manifest({"human_speech": False, "speech_like": True})[0] == "CONTROLLED_TTS_BENCHMARK"
    assert classify_manifest({})[0] == "TECHNICAL_SMOKE_ONLY"
