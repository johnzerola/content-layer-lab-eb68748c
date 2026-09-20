import io
import base64
import json
import math
import subprocess
import struct
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import wave
from pathlib import Path
from unittest.mock import patch

from backend.chatscene_voice import service
from backend.chatscene_voice.omnivoice_catalog import approved_voice_ids, definitions, load_model, write_wave
from backend.chatscene_voice.service import PIPER_VOICES, compact_speech_audio, synthesize_piper, transform_speech


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
    def test_reference_metadata_is_bounded_and_uses_safe_defaults(self):
        metadata = service.reference_metadata({
            "name": "  Narrador grave ",
            "category": "terror",
            "gender": "masculina",
            "style": "jornalística",
        }, "12345678", 5.2)
        self.assertEqual(metadata["name"], "Narrador grave")
        self.assertEqual(metadata["category"], "terror")
        self.assertEqual(metadata["gender"], "masculina")
        self.assertEqual(metadata["durationSec"], 5.2)
        fallback = service.reference_metadata({}, "abcdef12", 3.1)
        self.assertEqual(fallback["name"], "Voz abcdef12")
        self.assertEqual(fallback["gender"], "neutra")

    def test_generated_audio_compacts_long_gaps_but_keeps_a_short_pause(self):
        sample_rate = 24000
        samples = []
        for seconds, amplitude in ((0.35, 8000), (0.55, 0), (0.35, 8000)):
            for index in range(round(seconds * sample_rate)):
                samples.append(
                    int(amplitude * math.sin(2 * math.pi * 220 * index / sample_rate))
                )
        source = io.BytesIO()
        with wave.open(source, "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(sample_rate)
            target.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))

        compact = compact_speech_audio(source.getvalue())
        duration, _ = metrics(compact)
        self.assertLess(duration, 1.0)
        self.assertGreater(duration, 0.7)

    def test_kokoro_reports_only_smoke_approved_installed_voices(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            model = root / "kokoro"
            (model / "voices").mkdir(parents=True)
            python = root / "python"
            worker = root / "worker.py"
            python.touch()
            worker.touch()
            (model / "config.json").touch()
            (model / "kokoro-v1_0.pth").touch()
            (model / "voices" / "pf_dora.pt").touch()
            with patch.object(service, "KOKORO_PYTHON", python), patch.object(service, "KOKORO_WORKER", worker), \
                 patch.object(service, "KOKORO_MODEL_DIR", model), patch.object(service, "KOKORO_READY", model / "runtime-ready"):
                self.assertEqual(service.kokoro_installed_ids(), [])
                (model / "runtime-ready").touch()
                self.assertEqual(service.kokoro_installed_ids(), ["pf_dora"])
                (model / "voices" / "pm_alex.pt").touch()
                self.assertEqual(service.kokoro_installed_ids(), ["pf_dora", "pm_alex"])

    def test_ptbr_v3_only_reports_installed_with_its_own_checkpoints(self):
        with tempfile.TemporaryDirectory() as root:
            model = Path(root)
            config = {"ready": True, "modelPath": str(model), "modelVariant": "ptbr-v3"}
            with patch.object(service, "runtime_config", return_value=config):
                self.assertFalse(service.engine_installed())
                for name in service.PTBR_V3_MODEL_FILES:
                    (model / name).touch()
                self.assertTrue(service.engine_installed())
                config["modelVariant"] = "multilingual-v2"
                self.assertFalse(service.engine_installed())

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

    def test_catalog_only_exposes_approved_profiles_with_assets(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            model = root / "model"
            model.mkdir()
            python = root / "python"
            python.touch()
            worker = root / "worker.py"
            worker.touch()
            ready = root / "runtime-ready"
            ready.touch()
            catalogue = root / "catalogue"
            catalogue.mkdir()
            (catalogue / "approved.json").write_text(
                '{"voiceIds":["omni-bia","omni-bia","omni-julia","../../other",{"bad":"id"}]}', encoding="utf-8"
            )
            (catalogue / "omni-bia.pt").touch()
            (catalogue / "omni-bia.wav").touch()
            with patch.object(service, "OMNI_PYTHON", python), patch.object(service, "OMNI_WORKER", worker), \
                 patch.object(service, "OMNI_MODEL", model), patch.object(service, "OMNI_CATALOG_DIR", catalogue), \
                 patch.object(service, "OMNI_CATALOG", Path(__file__).with_name("omnivoice_catalog.json")), \
                 patch.object(service, "OMNI_READY", ready), patch.object(service, "OMNI_LICENSE_APPROVED", True):
                self.assertEqual(service.omnivoice_catalog_ids(), ["omni-bia"])
                with patch.object(service, "OMNI_LICENSE_APPROVED", False):
                    self.assertEqual(service.omnivoice_catalog_ids(), [])
            self.assertEqual(approved_voice_ids(catalogue), ["omni-bia"])

    def test_catalog_definitions_are_unique_and_wave_serializes(self):
        data = definitions()
        self.assertEqual(len(data["voices"]), 18)
        output = io.BytesIO()
        write_wave(output, [0.0, 0.5, -0.5], 24000)
        with wave.open(io.BytesIO(output.getvalue()), "rb") as audio:
            self.assertEqual(audio.getnframes(), 3)
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "sample.wav"
            write_wave(path, [0.0, 0.5, -0.5], 24000)
            self.assertTrue(path.is_file())

    def test_model_loader_requires_local_checkpoint(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                load_model(Path(root) / "missing")

    def test_catalog_endpoint_rejects_unavailable_voice_without_starting_model(self):
        token = "test-secret-32-characters-or-more"
        server = service.ThreadingHTTPServer(("127.0.0.1", 0), service.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/v1/voice/catalog/synthesize",
                data=json.dumps({"text": "Oi", "voice": "omni-bia"}).encode("utf-8"),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            with patch.object(service, "SERVICE_SECRET", token), \
                 patch.object(service, "omnivoice_catalog_ids", return_value=[]), \
                 patch.object(service.OMNI, "synthesize") as synthesize:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(request, timeout=3)
                self.assertEqual(error.exception.code, 400)
                synthesize.assert_not_called()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_catalog_endpoint_returns_worker_audio_for_approved_voice(self):
        token = "test-secret-32-characters-or-more"
        server = service.ThreadingHTTPServer(("127.0.0.1", 0), service.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/v1/voice/catalog/synthesize",
                data=json.dumps({"text": "Oi", "voice": "omni-bia", "speed": 1.1}).encode("utf-8"),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            sample = tone_wav(seconds=0.1)
            with patch.object(service, "SERVICE_SECRET", token), \
                 patch.object(service, "omnivoice_catalog_ids", return_value=["omni-bia"]), \
                 patch.object(service.CPU, "close"), \
                 patch.object(service.OMNI, "synthesize", return_value=sample) as synthesize:
                with urllib.request.urlopen(request, timeout=3) as response:
                    result = json.load(response)
                self.assertEqual(base64.b64decode(result["audio"]), sample)
                synthesize.assert_called_once_with("Oi", "omni-bia", 1.1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
