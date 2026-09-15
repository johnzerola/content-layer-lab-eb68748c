"""Experimental reference cancellation for an unchanged-speed music master.

Requires the actual soundtrack waveform, not its title. No downloads, neural
inference, time stretching or production changes. Rejects weak alignment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy import signal


def separate_reference(mixture, reference, rate):
    mixture = np.asarray(mixture, dtype=np.float64)
    reference = np.asarray(reference, dtype=np.float64)
    if (rate != 48000 or mixture.ndim != 2 or reference.ndim != 2
            or mixture.shape[1] != reference.shape[1] or mixture.shape[1] not in (1, 2)
            or len(mixture) < 4 * rate or len(reference) < 4 * rate
            or not np.isfinite(mixture).all() or not np.isfinite(reference).all()):
        raise ValueError("Use finite mono/stereo 48 kHz arrays with matching channels and >=4 s")
    # Summing per-channel correlations also supports stereo with opposite polarity.
    step = 6
    mix_low = signal.resample_poly(mixture, 1, step, axis=0)
    ref_low = signal.resample_poly(reference, 1, step, axis=0)
    correlation = sum(signal.correlate(mix_low[:, c], ref_low[:, c], method="fft")
                      for c in range(mixture.shape[1]))
    lags = signal.correlation_lags(len(mix_low), len(ref_low))
    lag = int(lags[np.argmax(np.abs(correlation))]) * step

    def aligned_at(offset):
        aligned = np.zeros_like(mixture)
        start_mix, start_ref = max(0, offset), max(0, -offset)
        length = min(len(mixture) - start_mix, len(reference) - start_ref)
        if length > 0:
            aligned[start_mix:start_mix + length] = reference[start_ref:start_ref + length]
        return aligned, max(0, length)

    # Resolve the decimation offset at native sample precision.
    candidates = range(lag - step, lag + step + 1)
    lag = max(candidates, key=lambda offset: abs(float(np.sum(mixture * aligned_at(offset)[0]))))
    aligned, overlap = aligned_at(lag)
    if overlap / len(mixture) < 0.95:
        raise ValueError("Reference covers less than 95% of the video; supply the matching version")

    gains, scores = [], []
    block = 2 * rate
    for start in range(0, len(mixture) - block + 1, block):
        x, r = mixture[start:start + block], aligned[start:start + block]
        energy = np.sum(r * r, axis=0)
        gain = np.sum(x * r, axis=0) / np.maximum(energy, 1e-12)
        score = np.abs(np.sum(x * r)) / max(float(np.linalg.norm(x) * np.linalg.norm(r)), 1e-12)
        gains.append(gain)
        scores.append(float(score))
    if np.mean(np.array(scores) >= 0.25) < 0.6:
        raise ValueError("Reference alignment is unreliable; no audio was changed")
    gain = np.median(np.asarray(gains)[np.asarray(scores) >= 0.25], axis=0)
    music = aligned * gain
    dialogue = mixture - music
    return dialogue, music, {
        "lag_samples": lag, "gain_per_channel": gain.tolist(),
        "window_correlations": scores, "coverage": overlap / len(mixture),
        "quality": "NOT_APPROVED: correlated dialogue and edited/remixed masters can invalidate cancellation",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    import soundfile as sf
    mixture, rate = sf.read(args.input, dtype="float32", always_2d=True)
    reference, reference_rate = sf.read(args.reference, dtype="float32", always_2d=True)
    if reference_rate != rate or len(mixture) > rate * 180 or len(reference) > rate * 600:
        raise ValueError("Use matching rates, video <=180 s, reference <=600 s")
    dialogue, music, report = separate_reference(mixture, reference, rate)
    args.output.mkdir(parents=True, exist_ok=False)
    sf.write(args.output / "dialogue.wav", dialogue, rate, subtype="FLOAT")
    sf.write(args.output / "music.wav", music, rate, subtype="FLOAT")
    report.update({
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "reference_sha256": hashlib.sha256(args.reference.read_bytes()).hexdigest(),
        "sample_rate": rate, "samples": len(mixture),
        "contract": "global delay + robust channel gain; no independent normalization",
    })
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
