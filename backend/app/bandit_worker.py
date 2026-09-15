"""Offline Bandit worker. Invoked in an isolated Python subprocess."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

REVISION = "7ec03cb568811958db65a96a10fdb8879922b2ac"
WEIGHT_SHA256 = "abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc"


def main():
    parser = argparse.ArgumentParser()
    for name in ("input", "output", "checkout", "checkpoint"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    args = parser.parse_args()
    revision = subprocess.check_output(["git", "-C", str(args.checkout), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(args.checkout), "status", "--porcelain"], text=True).strip()
    if revision != REVISION or dirty:
        raise ValueError("Unexpected Bandit source revision")
    if hashlib.sha256(args.checkpoint.read_bytes()).hexdigest() != WEIGHT_SHA256:
        raise ValueError("Unexpected Bandit checkpoint")
    sys.path.insert(0, str(args.checkout / "src"))
    import numpy as np
    import soundfile as sf
    import torch
    from bandit_infer import BanditSession
    audio, rate = sf.read(args.input, dtype="float32", always_2d=True)
    if rate != 48000 or audio.shape[1] not in (1, 2) or not 0 < len(audio) <= 48000 * 180:
        raise ValueError("Expected mono/stereo 48 kHz audio, maximum 180 seconds")
    if not np.isfinite(audio).all():
        raise ValueError("Non-finite audio")
    torch.set_num_threads(2)
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; no automatic fallback")
    with BanditSession("v2-multi", device=args.device, checkpoint_path=args.checkpoint,
                       checkpoint_sha256=WEIGHT_SHA256) as session:
        stems = session.infer(audio.T, sample_rate=rate)
    for name in ("speech", "music", "effects"):
        if stems[name].shape != audio.T.shape or not np.isfinite(stems[name]).all():
            raise ValueError("Invalid Bandit output")
    args.output.mkdir(parents=True, exist_ok=False)
    sf.write(args.output / "vocals.wav", stems["speech"].T, rate, subtype="FLOAT")
    sf.write(args.output / "no_vocals.wav", (stems["music"] + stems["effects"]).T, rate, subtype="FLOAT")
    (args.output / "provenance.json").write_text(json.dumps({
        "engine": "bandit", "model": "v2-multi", "revision": REVISION,
        "checkpoint_sha256": WEIGHT_SHA256, "device": args.device,
        "precision": "fp32", "sample_rate": rate, "samples": len(audio),
        "routing": "speech / music + effects", "weights_license": "CC-BY-SA-4.0",
        "attribution": "Bandit V2 — Karn Watcharasupat and collaborators, https://zenodo.org/records/12701995",
    }), encoding="utf-8")


if __name__ == "__main__":
    main()
