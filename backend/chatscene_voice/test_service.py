import io
import math
import subprocess
import struct
import unittest
import wave

from backend.chatscene_voice.service import PIPER_VOICES, synthesize_piper, transform_speech


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


if __name__ == "__main__":
    unittest.main()
