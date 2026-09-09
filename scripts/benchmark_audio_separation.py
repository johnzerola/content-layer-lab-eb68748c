#!/usr/bin/env python3
"""Benchmark the installed Demucs profiles without changing production config.

Usage: python scripts/benchmark_audio_separation.py input.wav --output .bench
It only runs models that are explicitly requested and writes timings to JSON.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path(".audio-benchmark"))
    parser.add_argument("--models", nargs="+", default=["htdemucs", "mdx_extra", "htdemucs_ft"])
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"arquivo não encontrado: {args.input}")
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for model in args.models:
        target = args.output / model
        started = time.perf_counter()
        command = [sys.executable, "-m", "demucs.separate", "-n", model,
                   "--two-stems", "vocals", "--device", "auto", "--shifts", "0",
                   "--segment", "7", "--overlap", "0.25", "-j", "0", "--float32",
                   "-o", str(target), str(args.input)]
        completed = subprocess.run(command, capture_output=True, text=True)
        elapsed = round(time.perf_counter() - started, 3)
        result = {"model": model, "seconds": elapsed, "returncode": completed.returncode}
        if completed.returncode == 0:
            result["voice"] = str(target / model / args.input.stem / "vocals.wav")
            result["music"] = str(target / model / args.input.stem / "no_vocals.wav")
        else:
            result["error"] = (completed.stderr or completed.stdout)[-1200:]
        results.append(result)
    report = {"input": str(args.input), "results": results, "ffmpeg": shutil.which("ffmpeg")}
    report_path = args.output / "report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if any(item["returncode"] == 0 for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
