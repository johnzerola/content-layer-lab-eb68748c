"""Isolated process entry point for python-audio-separator.

The model cache must already contain registry-verified files. Network access is
disabled here so a benchmark cannot silently replace a checkpoint.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import time


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--config")
    parser.add_argument("--device", required=True, choices=("cpu", "cuda"))
    parser.add_argument(
        "--precision", required=True, choices=("fp32", "autocast", "native-fp16")
    )
    parser.add_argument("--sample-rate", required=True, type=int)
    return parser.parse_args(argv)


def _frozen_model_catalog(model: str, config: str | None) -> dict:
    """Expose only the registry-approved files to audio-separator."""
    if model.lower().endswith(".onnx"):
        model_type = "MDX"
        files = [model]
    elif model.lower().endswith(".ckpt") and config:
        model_type = "MDXC"
        files = [model, config]
    else:
        raise RuntimeError(f"Unsupported frozen audio-separator model contract: {model}")
    return {
        "VR": {},
        "MDX": {
            "Frozen registry recipe": {
                "filename": model,
                "scores": {},
                "stems": [],
                "target_stem": None,
                "download_files": files,
            }
        }
        if model_type == "MDX"
        else {},
        "Demucs": {},
        "MDXC": {
            "Frozen registry recipe": {
                "filename": model,
                "scores": {},
                "stems": [],
                "target_stem": None,
                "download_files": files,
            }
        }
        if model_type == "MDXC"
        else {},
    }


def _resolve_outputs(paths: list[str], output_dir: Path) -> tuple[Path, Path]:
    files = [Path(path) if Path(path).is_absolute() else output_dir / path for path in paths]
    dialogue = next(
        (
            path
            for path in files
            if path.stem.lower() == "dialogue" or "vocal" in path.stem.lower()
        ),
        None,
    )
    music = next(
        (
            path
            for path in files
            if path.stem.lower() == "music"
            or any(
                token in path.stem.lower()
                for token in ("instrument", "no_vocal", "karaoke", "other")
            )
        ),
        None,
    )
    if dialogue is None or music is None or dialogue == music:
        raise RuntimeError(f"Cannot map output stems: {[path.name for path in files]}")
    return dialogue, music


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    if not (args.model_dir / args.model).is_file():
        raise FileNotFoundError(f"Verified model is not present in cache: {args.model}")
    if args.config and not (args.model_dir / args.config).is_file():
        raise FileNotFoundError(f"Verified model config is not present in cache: {args.config}")

    # Block package downloads. The parent process verifies SHA-256 before launch.
    os.environ["AUDIO_SEPARATOR_MODEL_DIR"] = str(args.model_dir)
    os.environ["HF_HUB_OFFLINE"] = "1"
    if args.device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""

    # The wrapper normally downloads a missing checkpoint/config. A benchmark
    # must use only files that the registry already verified.
    import importlib

    separator_module = importlib.import_module("audio_separator.separator.separator")

    def blocked_download(*_args, **_kwargs):
        raise RuntimeError("Network access is disabled in the frozen audio benchmark runner.")

    separator_module.requests.get = blocked_download
    Separator = separator_module.Separator

    started = time.monotonic()
    separator = Separator(
        model_file_dir=str(args.model_dir),
        output_dir=str(args.output_dir),
        output_format="WAV",
        sample_rate=args.sample_rate,
        use_soundfile=True,
        use_autocast=args.precision == "autocast",
        use_native_fp16=args.precision == "native-fp16",
    )
    detected_device = getattr(separator.torch_device, "type", str(separator.torch_device))
    if args.device == "cuda" and detected_device != "cuda":
        raise RuntimeError(f"CUDA was required but audio-separator selected {detected_device}.")
    if args.device == "cpu" and detected_device != "cpu":
        raise RuntimeError(f"CPU was required but audio-separator selected {detected_device}.")

    torch = importlib.import_module("torch")
    if detected_device == "cuda":
        torch.cuda.reset_peak_memory_stats()

    separator.list_supported_model_files = lambda: _frozen_model_catalog(
        args.model, args.config
    )
    separator.load_model(args.model)
    outputs = separator.separate(
        str(args.input),
        custom_output_names={"Vocals": "dialogue", "Instrumental": "music", "Other": "music"},
    )
    dialogue, music = _resolve_outputs(outputs, args.output_dir)
    published_dialogue = args.output_dir / "dialogue.wav"
    published_music = args.output_dir / "music.wav"
    if dialogue.resolve() != published_dialogue.resolve():
        shutil.move(str(dialogue), published_dialogue)
    if music.resolve() != published_music.resolve():
        shutil.move(str(music), published_music)

    if detected_device == "cuda":
        torch.cuda.synchronize()
        peak_vram_mib = round(torch.cuda.max_memory_allocated() / (1024 * 1024), 2)
        device_name = torch.cuda.get_device_name(0)
    else:
        peak_vram_mib = None
        device_name = None

    report = {
        "ok": True,
        "engine": "audio-separator",
        "model": args.model,
        "device_requested": args.device,
        "device_detected": detected_device,
        "device_name": device_name,
        "peak_vram_allocated_mib": peak_vram_mib,
        "precision_requested": args.precision,
        "precision_effective": separator.effective_precision,
        "sample_rate": args.sample_rate,
        "processing_seconds": round(time.monotonic() - started, 3),
        "outputs": {"dialogue": "dialogue.wav", "music": "music.wav"},
    }
    (args.output_dir / "engine-result.json").write_text(
        json.dumps(report, indent=2, sort_keys=True), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
