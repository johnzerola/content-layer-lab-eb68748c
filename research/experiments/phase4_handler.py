"""Disposable RunPod handler for the bounded RealBasicVSR phase-4 experiment."""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

import requests
import runpod
import torch


CHECKPOINT = Path("/opt/phase4/realbasicvsr.pth")
CHECKPOINT_SHA256 = "52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376"


def handler(event):
    payload = (event or {}).get("input") or {}
    if payload.get("action") == "health":
        return {"ok": True, "phase": 4, "model": "RealBasicVSRNet",
                "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                "cuda": torch.cuda.is_available(), "checkpoint": CHECKPOINT.exists()}
    source_url = str(payload.get("source_url") or "")
    roi = payload.get("roi")
    if not source_url or not isinstance(roi, list) or len(roi) != 4:
        return {"ok": False, "error": "source_url and four-value roi required"}
    work = Path(tempfile.mkdtemp(prefix="phase4-"))
    started = time.monotonic()
    try:
        source = work / "input.mp4"
        response = requests.get(source_url, stream=True, timeout=(15, 120))
        response.raise_for_status()
        with source.open("wb") as output:
            for block in response.iter_content(1024 * 1024):
                output.write(block)
        target = work / "result"
        command = ["python", "/opt/phase4/phase4_restore.py", "--input", str(source),
                   "--checkpoint", str(CHECKPOINT), "--checkpoint-sha256", CHECKPOINT_SHA256,
                   "--output", str(target), "--roi", *[str(int(v)) for v in roi],
                   "--strength", str(float(payload.get("strength", .25))),
                   "--window", str(int(payload.get("window", 3))),
                   "--context", str(int(payload.get("context", 2))), "--scene-confirmed"]
        subprocess.run(command, check=True, timeout=720)
        candidate = target / "candidate.mp4"
        raw = candidate.read_bytes()
        report = json.loads((target / "report.json").read_text(encoding="utf-8"))
        return {"ok": True, "output_b64": base64.b64encode(raw).decode(),
                "checksum": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                "seconds": round(time.monotonic() - started, 2), "report": report}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:500]}"}
    finally:
        shutil.rmtree(work, ignore_errors=True)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


runpod.serverless.start({"handler": handler})
