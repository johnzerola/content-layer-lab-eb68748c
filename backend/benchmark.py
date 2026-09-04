#!/usr/bin/env python3
"""Benchmark do Clean Engine.

    python benchmark.py input.mp4
    python benchmark.py input.mp4 --pipelines fast,high --preview 5

Compara os caminhos disponíveis e registra tempo por estágio, RAM, VRAM,
fator de tempo real, quality score e tamanho de saída. Sem números medidos,
nenhuma configuração pode ser chamada de "melhor".
"""
from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.pipelines.caption_pipeline import RUNNERS_BY_MODE  # noqa: E402
from app.pipelines.clean_pipeline import CleanOptions, clean_video  # noqa: E402
from app.utils.video import probe  # noqa: E402


def _peak_ram_mb() -> float:
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux reporta em KB, macOS em bytes.
    return round(usage / 1024.0 if usage > 1024 * 64 else usage / 1.0, 1)


def _vram_mb() -> float | None:
    try:
        import torch  # noqa: WPS433

        if torch.cuda.is_available():
            return round(torch.cuda.max_memory_allocated() / (1024 * 1024), 1)
    except Exception:
        return None
    return None


def run_case(source: str, name: str, options: CleanOptions, outdir: str) -> dict:
    output = os.path.join(outdir, f"bench_{name}.mp4")
    started = time.perf_counter()
    result = clean_video(source, output, options)
    elapsed = time.perf_counter() - started
    duration = probe(output).duration or 1.0
    return {
        "pipeline": name,
        "mode": options.mode,
        "quality": options.quality,
        "engine": result.engine,
        "resolution": result.roi,
        "video_seconds": round(duration, 2),
        "processing_seconds": round(elapsed, 2),
        "realtime_factor": round(elapsed / duration, 2),
        "quality_score": round(result.score, 1),
        "route": result.route,
        "metrics": result.metrics,
        "telemetry_ms": result.telemetry,
        "peak_ram_mb": _peak_ram_mb(),
        "vram_mb": _vram_mb(),
        "output_mb": round(os.path.getsize(output) / (1024 * 1024), 2),
        "output": output,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark do VaiViral Clean Engine")
    parser.add_argument("input")
    parser.add_argument("--mode", default="caption", choices=sorted(RUNNERS_BY_MODE))
    parser.add_argument("--pipelines", default="fast,high", help="fast,high,max")
    parser.add_argument("--preview", type=float, default=0.0)
    parser.add_argument("--outdir", default="benchmarks")
    parser.add_argument("--report", default=None, help="arquivo JSON de saída")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    cases = [p.strip() for p in args.pipelines.split(",") if p.strip()]
    rows = []
    for quality in cases:
        options = CleanOptions(
            mode=args.mode,
            quality=quality,
            preview_seconds=args.preview,
            workdir=os.path.join(args.outdir, ".cache"),
            keep_workdir=True,
        )
        print(f"→ rodando pipeline {quality} ({args.mode})…")
        rows.append(run_case(args.input, f"{args.mode}_{quality}", options, args.outdir))

    print()
    header = f"{'pipeline':<18}{'RTF':>7}{'score':>8}{'texto':>9}{'nitidez':>9}{'RAM MB':>9}"
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['pipeline']:<18}"
            f"{row['realtime_factor']:>7}"
            f"{row['quality_score']:>8}"
            f"{row['metrics'].get('residual_text', 0):>9}"
            f"{row['metrics'].get('sharpness_ratio', 1):>9}"
            f"{row['peak_ram_mb']:>9}"
        )

    report = args.report or os.path.join(args.outdir, "report.json")
    with open(report, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2, ensure_ascii=False)
    print(f"\nrelatório: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
