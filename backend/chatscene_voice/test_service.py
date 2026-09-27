import io
import base64
import math
import subprocess
import struct
import unittest
import wave
import json
import os
import hashlib
import uuid
from pathlib import Path
import tempfile
from unittest.mock import patch

from backend.chatscene_voice.service import (
    PIPER_VOICES,
    cached_synthetic_audio,
    gpu_synthesize,
    list_reference_metadata,
    synthesize_piper,
    transform_speech,
)
from backend.chatscene_voice.catalog import catalog_reference_path, load_catalog


def tone_wav(frequency=220, seconds=1.2, sample_rate=24000):
    pcm = b"".join(
        struct.pack("<h", int(8000 * math.sin(2 * math.pi * frequency * i / sample_rate)))
        for i in range(round(seconds * sample_rate))
    )
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(pcm)
    return output.getvalue()


def metrics(audio):
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "24000", "-f", "s16le", "pipe:1"],
        input=audio, stdout=subprocess.PIPE, check=True,
    )
    frames = len(process.stdout) // 2
    samples = struct.unpack(f"<{frames}h", process.stdout)
    crossings = sum(a <= 0 < b for a, b in zip(samples, samples[1:]))
    duration = frames / 24000
    return duration, crossings / duration


class VoiceServiceTests(unittest.TestCase):
    def test_gpu_synthesis_uses_relay_health_and_forwards_fidelity_mode(self):
        response = unittest.mock.MagicMock()
        response.read.return_value = json.dumps(
            {"audio": base64.b64encode(tone_wav(seconds=0.1)).decode("ascii")}
        ).encode("utf-8")
        response.status = 200
        urlopen = unittest.mock.MagicMock()
        urlopen.return_value.__enter__.return_value = response
        with (
            patch("backend.chatscene_voice.service.GPU_RELAY_TOKEN", "test-token"),
            patch(
                "backend.chatscene_voice.service.relay_health",
                return_value={"ready": True, "device": "cuda", "modelLoaded": True},
            ),
            patch("backend.chatscene_voice.service.urllib.request.urlopen", urlopen),
        ):
            audio, device = gpu_synthesize("Oi", tone_wav(seconds=0.1), True, True)

        self.assertEqual(device, "cuda")
        self.assertTrue(audio)
        request = urlopen.call_args.args[0]
        self.assertTrue(json.loads(request.data)["fidelityMode"])
        self.assertTrue(json.loads(request.data)["voiceConversionPass"])

    def test_lists_saved_references_from_private_account_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            user_id = str(uuid.uuid4())
            reference_id = str(uuid.uuid4())
            account = Path(directory) / hashlib.sha256(user_id.encode("utf-8")).hexdigest()
            account.mkdir()
            (account / f"{reference_id}.wav").write_bytes(tone_wav(seconds=0.1))
            (account / f"{reference_id}.json").write_text(
                json.dumps(
                    {
                        "name": "Narrador autorizado",
                        "durationSec": 7.5,
                        "createdAt": 123,
                    }
                ),
                encoding="utf-8",
            )

            with patch(
                "backend.chatscene_voice.service.runtime_config",
                return_value={"storagePath": directory},
            ):
                references = list_reference_metadata(user_id)

        self.assertEqual(
            references,
            [
                {
                    "id": reference_id,
                    "name": "Narrador autorizado",
                    "durationSec": 7.5,
                    "createdAt": 123,
                }
            ],
        )

    def test_synthetic_cache_reuses_identical_audio(self):
        calls = 0

        def produce():
            nonlocal calls
            calls += 1
            return tone_wav(seconds=0.1)

        with tempfile.TemporaryDirectory() as directory:
            with patch("backend.chatscene_voice.service.ROOT", Path(directory)):
                first = cached_synthetic_audio("test", {"voice": "ana", "text": "Oi"}, produce)
                second = cached_synthetic_audio("test", {"text": "Oi", "voice": "ana"}, produce)
        self.assertEqual(first, second)
        self.assertEqual(calls, 1)

    def test_pitch_changes_without_changing_duration(self):
        source = tone_wav()
        config = lambda pitch: {
            "mode": "PITCH_ONLY", "speedMultiplier": 1,
            "pitchSemitones": pitch, "linkedPitchToSpeed": False,
            "normalization": {"enabled": False},
        }
        deep_duration, deep_frequency = metrics(transform_speech(source, config(-4)))
        high_duration, high_frequency = metrics(transform_speech(source, config(4)))
        self.assertAlmostEqual(deep_duration, 1.2, delta=0.08)
        self.assertAlmostEqual(high_duration, 1.2, delta=0.08)
        self.assertGreater(high_frequency, deep_frequency * 1.2)

    def test_only_allowlisted_piper_models(self):
        self.assertEqual(set(PIPER_VOICES), {"pt_BR-faber-medium", "pt_BR-cadu-medium", "pt_BR-jeff-medium"})
        with self.assertRaises(ValueError):
            synthesize_piper("Oi", voice="../../other-model")

    def test_catalog_only_resolves_installed_allowlisted_wav(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog = root / "catalog"
            catalog.mkdir()
            (catalog / "catalog.json").write_text(json.dumps({
                "schemaVersion": 1,
                "license": "Apache-2.0",
                "voices": [{"id": "ana-natural", "name": "Ana"}, {"id": "../escape"}],
            }), encoding="utf-8")
            (catalog / "ana-natural.wav").write_bytes(tone_wav(seconds=0.1))
            with patch.dict(os.environ, {
                "CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED": "1",
                "CHATSCENE_SYNTHETIC_CATALOG_DIR": str(catalog),
            }):
                self.assertEqual([voice["id"] for voice in load_catalog(root)], ["ana-natural"])
                self.assertEqual(catalog_reference_path(root, "ana-natural"), catalog / "ana-natural.wav")
                with self.assertRaises(ValueError):
                    catalog_reference_path(root, "../escape")

    def test_authorized_base_catalog_is_separate_from_synthetic_license(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog = root / "authorized-catalog"
            catalog.mkdir()
            (catalog / "catalog.json").write_text(json.dumps({
                "schemaVersion": 1,
                "license": "User-authorized",
                "voices": [{
                    "id": "authorized-base-01",
                    "name": "Voz base 1",
                    "voiceConversionPass": True,
                }],
            }), encoding="utf-8")
            (catalog / "authorized-base-01.wav").write_bytes(tone_wav(seconds=0.1))
            with patch.dict(os.environ, {
                "CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED": "0",
                "CHATSCENE_AUTHORIZED_CATALOG_APPROVED": "1",
                "CHATSCENE_AUTHORIZED_CATALOG_DIR": str(catalog),
            }):
                voices = load_catalog(root)
                self.assertEqual([voice["id"] for voice in voices], ["authorized-base-01"])
                self.assertEqual(voices[0]["provenance"], "authorized")
                self.assertTrue(voices[0]["voiceConversionPass"])
                self.assertEqual(
                    catalog_reference_path(root, "authorized-base-01"),
                    catalog / "authorized-base-01.wav",
                )


if __name__ == "__main__":
    unittest.main()
