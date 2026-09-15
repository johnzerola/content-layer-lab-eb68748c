"""Offline, research-only CASS pilot. Does not change the production engine.

Run with the existing isolated CUDA Python and a pinned bandit-infer checkout.
Input must be a mono/stereo 48 kHz WAV; default limit 30 seconds.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

REVISION = "7ec03cb568811958db65a96a10fdb8879922b2ac"
WEIGHT_SHA256 = "abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), required=True)
    parser.add_argument("--max-seconds", type=int, choices=range(1, 181), default=30)
    args = parser.parse_args()
    revision = subprocess.check_output(
        ["git", "-C", str(args.checkout), "rev-parse", "HEAD"], text=True
    ).strip()
    if revision != REVISION:
        raise ValueError("Unexpected bandit-infer revision")
    if subprocess.check_output(
        ["git", "-C", str(args.checkout), "status", "--porcelain"], text=True
    ).strip():
        raise ValueError("Use the untouched pinned checkout")
    if hashlib.sha256(args.checkpoint.read_bytes()).hexdigest() != WEIGHT_SHA256:
        raise ValueError("Unexpected checkpoint digest")
    sys.path.insert(0, str(args.checkout / "src"))
    import numpy as np
    import soundfile as sf
    import torch
    from bandit_infer import BanditSession

    audio, rate = sf.read(args.input, dtype="float32", always_2d=True)
    if rate != 48000 or audio.shape[1] not in (1, 2) or not 0 < len(audio) <= args.max_seconds * rate:
        raise ValueError(f"Expected 48 kHz mono/stereo, at most {args.max_seconds} seconds")
    if not np.isfinite(audio).all():
        raise ValueError("Non-finite input")
    torch.set_num_threads(2)
    if args.device == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA unavailable in this Python environment; choose the verified GPU runtime")
        torch.cuda.reset_peak_memory_stats()
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    print("Loading v2-multi (offline)", flush=True)
    with BanditSession("v2-multi", device=args.device, checkpoint_path=args.checkpoint,
                       checkpoint_sha256=WEIGHT_SHA256) as session:
        loaded = time.monotonic()
        print("Separating dialogue, music and effects", flush=True)
        stems = session.infer(audio.T, sample_rate=rate)
    elapsed = time.monotonic() - started
    for name, values in stems.items():
        if values.shape != audio.T.shape or not np.isfinite(values).all():
            raise ValueError(f"Invalid {name} output")
        sf.write(args.output / f"native-{name}.wav", values.T, rate, subtype="FLOAT")
    sf.write(args.output / "dialogue.wav", stems["speech"].T, rate, subtype="FLOAT")
    background = stems["music"] + stems["effects"]
    sf.write(args.output / "music-and-environment.wav", background.T, rate, subtype="FLOAT")
    residual = audio.T - stems["speech"] - background
    report = {
        "status": "INFERENCE_COMPLETE_QUALITY_NOT_APPROVED",
        "input": str(args.input.resolve()),
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "model": "Bandit V2 multi", "code_revision": revision,
        "checkpoint_sha256": WEIGHT_SHA256,
        "weights_license": "CC-BY-SA-4.0", "code_license": "Apache-2.0",
        "device": args.device, "torch": torch.__version__,
        "precision": "fp32", "chunk_seconds": 8, "hop_seconds": 1,
        "duration": len(audio) / rate, "sample_rate": rate,
        "load_seconds": loaded - started, "total_seconds": elapsed,
        "peak_cuda_mib": torch.cuda.max_memory_allocated() / 2**20 if args.device == "cuda" else None,
        "relative_reconstruction_error": float(np.linalg.norm(residual) / max(np.linalg.norm(audio), 1e-12)),
        "quality": "Requires listening for singing leakage and lost dialogue; reconstruction error is not semantic quality.",
        "routing": {"dialogue": "speech", "music-and-environment": "music + effects"},
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
