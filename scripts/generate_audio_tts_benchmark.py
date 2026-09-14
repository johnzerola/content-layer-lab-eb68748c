"""Build controlled dialogue/music fixtures from two authorized speech WAVs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

from audio_benchmark_controls import mix_at_ratio


RATE = 44_100


def read_mono(path: Path) -> np.ndarray:
    rate, pcm = wavfile.read(path)
    if pcm.ndim > 1:
        pcm = np.mean(pcm.astype(np.float64), axis=1)
    if np.issubdtype(pcm.dtype, np.integer):
        info = np.iinfo(pcm.dtype)
        pcm = pcm.astype(np.float64) / float(max(abs(info.min), info.max))
    else:
        pcm = pcm.astype(np.float64)
    if rate != RATE:
        divisor = int(np.gcd(rate, RATE))
        pcm = resample_poly(pcm, RATE // divisor, rate // divisor)
    peak = float(np.max(np.abs(pcm)))
    return pcm / peak * 0.7 if peak else pcm


def fade(pcm: np.ndarray, seconds: float = 0.025) -> np.ndarray:
    count = min(int(RATE * seconds), len(pcm) // 2)
    if count:
        ramp = np.linspace(0, 1, count, endpoint=False)
        pcm[:count] *= ramp
        pcm[-count:] *= ramp[::-1]
    return pcm


def conversation(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    first = first[: int(4.5 * RATE)]
    second = second[: int(4.5 * RATE)]
    lead = int(0.35 * RATE)
    gap = int(0.25 * RATE)
    second_start = lead + len(first) + gap
    reprise_start = second_start + len(second) + gap
    total = reprise_start + min(len(first), int(2.0 * RATE)) + int(0.4 * RATE)
    mono = np.zeros(total, dtype=np.float64)
    mono[lead:lead + len(first)] += fade(first.copy())
    mono[second_start:second_start + len(second)] += fade(second.copy())
    reprise = fade(first[: min(len(first), int(2.0 * RATE))].copy())
    mono[reprise_start:reprise_start + len(reprise)] += reprise
    # Small stereo room difference without changing the spoken content.
    delay = int(0.006 * RATE)
    right = np.pad(mono[:-delay], (delay, 0)) * 0.97
    return np.column_stack((mono, right))


def accompaniment(samples: int) -> np.ndarray:
    t = np.arange(samples, dtype=np.float64) / RATE
    progression = ((t // 1.5).astype(int) % 4)
    roots = np.array([110.0, 146.83, 164.81, 130.81])[progression]
    music = np.zeros(samples, dtype=np.float64)
    for multiplier, gain in ((1.0, 0.45), (1.25, 0.27), (1.5, 0.22), (2.0, 0.12), (3.0, 0.06)):
        phase = 2 * np.pi * np.cumsum(roots * multiplier) / RATE
        music += gain * np.sin(phase)
    beat_phase = np.mod(t, 0.5)
    kick = np.sin(2 * np.pi * (62 - 35 * np.minimum(beat_phase, 0.12) / 0.12) * t) * np.exp(-beat_phase * 24)
    shimmer = 0.05 * np.sin(2 * np.pi * 3300 * t) * (np.mod(t, 0.25) < 0.035)
    mono = music + 0.22 * kick + shimmer
    envelope = np.minimum(1, t / 0.08) * np.minimum(1, (samples / RATE - t) / 0.12)
    mono *= np.clip(envelope, 0, 1)
    right = np.roll(mono, int(0.003 * RATE)) * 0.94
    return np.column_stack((mono, right))


def file_entry(path: Path, owner: Path) -> dict[str, str]:
    return {"path": str(path.relative_to(owner)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speaker-a", required=True, type=Path)
    parser.add_argument("--speaker-b", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--fixture-prefix", default="tts-dialogue")
    parser.add_argument("--scope", default="SYNTHETIC_TTS_ENGINEERING")
    parser.add_argument("--human-speech", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument(
        "--speech-source",
        default="Windows SAPI Microsoft Maria Desktop and Microsoft Zira Desktop",
    )
    parser.add_argument(
        "--license",
        default="Locally synthesized project research fixture; do not treat as licensed natural-speech holdout.",
    )
    parser.add_argument("--limitation", action="append", dest="limitations")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    dialogue = conversation(read_mono(args.speaker_a), read_mono(args.speaker_b))
    music = accompaniment(len(dialogue))
    activity = np.max(np.abs(dialogue), axis=1) > 1e-5
    fixtures = []
    for ratio in (-15, 0, 10):
        dialogue_scaled, music_scaled, music_gain, common_gain = mix_at_ratio(dialogue, music, ratio, activity)
        files = {}
        for role, pcm in (("dialogue", dialogue_scaled), ("music", music_scaled), ("input", dialogue_scaled + music_scaled)):
            path = args.output / f"{args.fixture_prefix}-{ratio}-{role}.wav"
            wavfile.write(path, RATE, pcm.astype(np.float32))
            files[role] = file_entry(path, args.output)
        fixtures.append({
            "id": f"{args.fixture_prefix}-{ratio}",
            "dialogue_to_music_db": ratio,
            "music_gain": music_gain,
            "common_gain": common_gain,
            "files": files,
        })
    manifest = {
        "schema_version": 1,
        "scope": args.scope,
        "human_speech": args.human_speech,
        "speech_like": True,
        "speech_source": args.speech_source,
        "license": args.license,
        "sample_rate": RATE,
        "channels": 2,
        "sample_count": len(dialogue),
        "input_sources": [
            {"path": str(args.speaker_a.resolve()), "sha256": hashlib.sha256(args.speaker_a.read_bytes()).hexdigest()},
            {"path": str(args.speaker_b.resolve()), "sha256": hashlib.sha256(args.speaker_b.read_bytes()).hexdigest()},
        ],
        "fixtures": fixtures,
        "limitations": args.limitations or [
            "Synthetic voices do not represent natural microphones, reverberation, overlap or emotion.",
            "Generated accompaniment is controlled and less diverse than commercial music.",
            "This set can reject a broken pipeline but cannot approve production quality.",
        ],
    }
    manifest_path = args.output / "fixture-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"fixtures": len(fixtures), "duration_seconds": len(dialogue) / RATE, "manifest": str(manifest_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
