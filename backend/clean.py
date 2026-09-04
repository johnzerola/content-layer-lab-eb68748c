#!/usr/bin/env python3
"""VaiViral Clean Engine — CLI local.

    python clean.py input.mp4 output.mp4 --mode caption
    python clean.py input.mp4 output.mp4 --mode karaoke --quality high
    python clean.py input.mp4 out.mp4 --preview 5 --cpu-only
    python clean.py --check            # ambiente: Python, FFmpeg, CPU, GPU, VRAM

Progresso é real (etapa por etapa do motor), nunca animação falsa.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.pipelines.caption_pipeline import (  # noqa: E402
    analyse, run_auto, run_caption, run_karaoke, run_static_logo, run_static_text,
)
from app.pipelines.clean_pipeline import CleanOptions  # noqa: E402

RUNNERS = {
    "caption": run_caption,
    "karaoke": run_karaoke,
    "text": run_static_text,
    "logo": run_static_logo,
    "auto": run_auto,
}


def environment() -> dict:
    """Detecta o ambiente antes de prometer qualquer coisa."""
    info: dict = {
        "python": platform.python_version(),
        "platform": f"{platform.system()} {platform.machine()}",
        "cpu_count": os.cpu_count(),
        "ffmpeg": None,
        "ffprobe": bool(shutil.which("ffprobe")),
        "opencv": None,
        "ocr": None,
        "torch": None,
        "cuda": False,
        "gpu": None,
        "vram_mb": None,
        "lama": None,
    }
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        try:
            out = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True).stdout
            info["ffmpeg"] = out.splitlines()[0].split(" ")[2] if out else "ok"
        except Exception:
            info["ffmpeg"] = "ok"
    try:
        import cv2  # noqa: WPS433

        info["opencv"] = cv2.__version__
    except Exception:
        pass
    try:
        from app.services.text_detect import detector_status

        info["ocr"] = detector_status()
    except Exception as exc:
        info["ocr"] = {"ready": False, "error": str(exc)}
    try:
        from app.providers.lama_provider import LaMaProvider

        info["lama"] = LaMaProvider().status()
    except Exception:
        pass
    try:
        import torch  # noqa: WPS433

        info["torch"] = torch.__version__
        info["cuda"] = bool(torch.cuda.is_available())
        if info["cuda"]:
            info["gpu"] = torch.cuda.get_device_name(0)
            info["vram_mb"] = int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
    except Exception:
        pass
    return info


def _print_env(info: dict) -> None:
    print("VaiViral Clean Engine — ambiente")
    print(f"  Python      : {info['python']} ({info['platform']})")
    print(f"  CPU         : {info['cpu_count']} núcleos")
    print(f"  FFmpeg      : {info['ffmpeg'] or 'AUSENTE'}   ffprobe: {'ok' if info['ffprobe'] else 'AUSENTE'}")
    print(f"  OpenCV      : {info['opencv'] or 'AUSENTE'}")
    ocr = info.get("ocr") or {}
    print(f"  OCR         : {'ok' if ocr.get('ready') else 'AUSENTE'} ({ocr.get('engine', '-')})")
    lama = info.get("lama") or {}
    print(f"  LaMa (ONNX) : {'ok' if lama.get('ready') else 'não configurado (CLEANER_LAMA_ONNX)'}")
    if info["cuda"]:
        print(f"  GPU         : {info['gpu']} — {info['vram_mb']} MB VRAM (CUDA ok)")
    else:
        print("  GPU         : nenhuma NVIDIA/CUDA detectada — motor roda em CPU")


def main() -> int:
    parser = argparse.ArgumentParser(description="VaiViral Clean Engine (local)")
    parser.add_argument("input", nargs="?", help="vídeo de entrada")
    parser.add_argument("output", nargs="?", help="vídeo de saída")
    parser.add_argument("--mode", default="caption", choices=sorted(RUNNERS))
    parser.add_argument("--quality", default="fast", choices=("fast", "high", "max"))
    parser.add_argument("--preview", type=float, default=0.0, help="processar só os N primeiros segundos")
    parser.add_argument("--cpu-only", action="store_true", default=True)
    parser.add_argument("--gpu", action="store_true", help="permitir caminho GPU quando disponível")
    parser.add_argument("--expand", type=int, default=4, help="mask_expand_px")
    parser.add_argument("--feather", type=int, default=3, help="mask_feather_px")
    parser.add_argument("--roi", help="ROI manual em percentual: x,y,w,h (ex.: 0.08,0.68,0.84,0.18)")
    parser.add_argument("--workdir", help="pasta de cache (proxy, OCR, cenas)")
    parser.add_argument("--json", action="store_true", help="imprimir relatório em JSON")
    parser.add_argument("--check", action="store_true", help="apenas checar o ambiente")
    parser.add_argument("--analyse", action="store_true", help="apenas analisar e sugerir modo")
    args = parser.parse_args()

    info = environment()
    if args.check:
        _print_env(info)
        return 0 if info["ffmpeg"] and info["opencv"] else 1

    if not args.input:
        parser.error("informe o vídeo de entrada")
    if not os.path.exists(args.input):
        print(f"arquivo não encontrado: {args.input}")
        return 2

    if args.analyse:
        print(json.dumps(analyse(args.input, args.workdir), indent=2, ensure_ascii=False))
        return 0

    if not args.output:
        parser.error("informe o vídeo de saída")

    roi_percent = None
    if args.roi:
        parts = [float(p) for p in args.roi.split(",")]
        if len(parts) != 4:
            parser.error("--roi precisa de 4 valores: x,y,w,h")
        roi_percent = {"x": parts[0], "y": parts[1], "w": parts[2], "h": parts[3]}

    options = CleanOptions(
        mode=args.mode,
        quality=args.quality,
        preview_seconds=max(0.0, args.preview),
        cpu_only=not args.gpu,
        gpu=bool(args.gpu),
        mask_expand_px=args.expand,
        mask_feather_px=args.feather,
        roi_percent=roi_percent,
        workdir=args.workdir,
        keep_workdir=True,
    )

    last = {"stage": ""}

    def progress(pct: float, stage: str) -> None:
        if stage != last["stage"]:
            last["stage"] = stage
            print(f"[{pct:5.1f}%] {stage}")

    started = time.perf_counter()
    result = RUNNERS[args.mode](args.input, args.output, options, progress)
    elapsed = time.perf_counter() - started

    from app.utils.video import probe

    duration = probe(args.output).duration or 1.0
    payload = result.as_dict()
    payload["processing_seconds"] = round(elapsed, 2)
    payload["realtime_factor"] = round(elapsed / duration, 2)
    payload["output_mb"] = round(os.path.getsize(args.output) / (1024 * 1024), 2)

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print()
        print(f"  saída            : {args.output} ({payload['output_mb']} MB)")
        print(f"  quality score    : {payload['quality_score']}/100  ({payload['route']})")
        print(f"  métricas         : {json.dumps(payload['metrics'], ensure_ascii=False)}")
        print(f"  ROI              : {payload['roi']}")
        print(f"  tempo            : {payload['processing_seconds']}s  (RTF {payload['realtime_factor']})")
        print(f"  telemetria (ms)  : {json.dumps(payload['telemetry_ms'])}")
        if payload["gpu_recommended"]:
            print("  atenção          : algum trecho ficou abaixo de 70 — recomendado repassar em GPU")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
