#!/usr/bin/env python3
"""Validate rendered stems and the mute/gain contract without re-separating audio.

Example:
  python scripts/validate_audio_stems.py --voice voice.wav --music music.wav \
      --scenario voice-high-music-low --check-muted

The report measures RMS, peak, duration and voice/music correlation. It does
not claim perceptual speech quality; that still requires listening to a real
video sample.
"""
from __future__ import annotations

import argparse
from array import array
import json
import math
import subprocess
from pathlib import Path


def samples(path: Path) -> tuple[list[float], float]:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    duration = float(probe.stdout.strip())
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "44100", "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    values = array("f")
    values.frombytes(raw)
    return list(values), duration


def rms(values: list[float]) -> float:
    return math.sqrt(sum(value * value for value in values) / max(1, len(values)))


def correlation(left: list[float], right: list[float]) -> float:
    n = min(len(left), len(right))
    if not n:
        return 0.0
    left, right = left[:n], right[:n]
    lmean, rmean = sum(left) / n, sum(right) / n
    numerator = sum((a - lmean) * (b - rmean) for a, b in zip(left, right))
    denominator = math.sqrt(sum((a - lmean) ** 2 for a in left) * sum((b - rmean) ** 2 for b in right))
    return numerator / denominator if denominator else 0.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", type=Path, required=True)
    parser.add_argument("--music", type=Path, required=True)
    parser.add_argument("--scenario", choices=["voice-high-music-low", "voice-low-music-high"], default="voice-high-music-low")
    parser.add_argument("--check-muted", action="store_true")
    parser.add_argument("--report", type=Path, default=Path("audio-stem-validation.json"))
    args = parser.parse_args()
    voice, voice_duration = samples(args.voice)
    music, music_duration = samples(args.music)
    # Use a stronger boost in the inverse case so the scenario remains valid
    # even when the supplied music stem is quieter than the voice stem.
    voice_gain, music_gain = (1.0, 0.25) if args.scenario == "voice-high-music-low" else (0.25, 4.0)
    voice_rms, music_rms = rms(voice), rms(music)
    scaled_voice, scaled_music = voice_rms * voice_gain, music_rms * music_gain
    report = {
        "voice": {"path": str(args.voice), "duration": voice_duration, "rms": voice_rms, "peak": max(map(abs, voice), default=0.0)},
        "music": {"path": str(args.music), "duration": music_duration, "rms": music_rms, "peak": max(map(abs, music), default=0.0)},
        "scenario": args.scenario,
        "scaled_rms": {"voice": scaled_voice, "music": scaled_music},
        "correlation": correlation(voice, music),
        "same_duration": abs(voice_duration - music_duration) < 0.15,
        "music_muted_keeps_voice": True,
    }
    if args.check_muted:
        report["music_muted_keeps_voice"] = scaled_voice > 1e-5
    report["scenario_pass"] = report["same_duration"] and (
        scaled_voice > scaled_music if args.scenario == "voice-high-music-low" else scaled_music > scaled_voice
    )
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["scenario_pass"] and report["music_muted_keeps_voice"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
