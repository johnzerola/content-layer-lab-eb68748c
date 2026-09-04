"""Handler serverless (RunPod) do CleanerIA — processa UM chunk por invocação.

Entrada esperada (`event["input"]`):

```json
{
  "chunk_index": 3,
  "source_url": "https://.../input.mp4?signed",
  "upload_url": "https://.../chunk-003.mp4?signed",   // PUT assinado (opcional)
  "start": 45.0, "end": 60.0, "overlap": 0.5,
  "mode": "subtitle", "preset": "quality",
  "masks": [ {region...} ],
  "options": { "dynamic_masks": true, "verify": true }
}
```

Saída: `{ ok, chunk_index, seconds, residual_text, output_url | output_b64 }`.

O handler reaproveita a pipeline do worker (`run_pipeline`), então a qualidade
é exatamente a mesma do modo pod persistente — muda apenas o recorte temporal.
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import shutil
import tempfile
import time
import uuid

import requests

from app.services.chunking import localize_masks, slice_video, trim_edges
from app.storage import job_dir as safe_job_dir
from app.utils.video import probe
from app.workers.tasks import run_pipeline

STORAGE_DIR = Path(os.getenv("CLEANER_STORAGE", "storage")).resolve()
DOWNLOAD_TIMEOUT = (30, 3600)
# VRAM mínima (GB) para o preset max (DiffuEraser); abaixo disso o erro é explícito.
MAX_PRESET_MIN_VRAM_GB = float(os.getenv("CLEANER_MAX_PRESET_MIN_VRAM_GB", "16"))


def _gpu_vram_gb() -> float | None:
    """VRAM total da GPU visível, em GB. None quando não há CUDA disponível."""
    try:
        import torch  # type: ignore

        if not torch.cuda.is_available():
            return None
        return torch.cuda.get_device_properties(0).total_memory / (1024**3)
    except Exception:
        return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _download(url: str, destination: Path) -> Path:
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT) as response:
        response.raise_for_status()
        with open(destination, "wb") as handle:
            for block in response.iter_content(chunk_size=1024 * 1024):
                if block:
                    handle.write(block)
    if destination.stat().st_size < 1024:
        raise RuntimeError("download do chunk veio vazio")
    return destination


def _upload(url: str, path: Path) -> None:
    with open(path, "rb") as handle:
        response = requests.put(
            url,
            data=handle,
            headers={"content-type": "video/mp4"},
            timeout=DOWNLOAD_TIMEOUT,
        )
    response.raise_for_status()


WORKER_VERSION = "v3"


def handler(event: dict) -> dict:
    payload = (event or {}).get("input") or {}
    started = time.monotonic()
    index = int(payload.get("chunk_index", 0))
    if str(payload.get("action") or "") == "health":
        return {
            "ok": True,
            "worker_version": WORKER_VERSION,
            "gpu_vram_gb": _gpu_vram_gb(),
        }
    source_url = str(payload.get("source_url") or "")
    source_is_chunk = payload.get("source_is_chunk") is True
    if not source_url:
        return {"ok": False, "chunk_index": index, "error": "source_url ausente"}


    preset = str(payload.get("preset", "quality"))
    if preset == "max":
        vram = _gpu_vram_gb()
        if vram is None:
            return {
                "ok": False,
                "chunk_index": index,
                "error": "preset max (DiffuEraser) exige GPU CUDA; nenhuma GPU visível neste worker",
            }
        if vram < MAX_PRESET_MIN_VRAM_GB:
            return {
                "ok": False,
                "chunk_index": index,
                "error": (
                    f"preset max (DiffuEraser) exige ~{MAX_PRESET_MIN_VRAM_GB:.0f} GB de VRAM; "
                    f"esta GPU tem {vram:.1f} GB. Use o preset quality (ProPainter)."
                ),
            }

    start = max(0.0, float(payload.get("start", 0.0)))
    end = float(payload.get("end", 0.0))
    overlap = max(0.0, float(payload.get("overlap", 0.5)))
    read_start = max(0.0, start - overlap)
    head = start - read_start
    body = max(0.2, end - start)
    read_duration = (end + overlap) - read_start

    job_id = str(uuid.uuid4())
    job_path = safe_job_dir(STORAGE_DIR, job_id)
    job_path.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix=f"chunk-{index}-"))
    try:
        full = _download(source_url, scratch / "source.mp4")
        # Só o trecho necessário (miolo + contexto) entra na pipeline.
        if source_is_chunk:
            chunk_input = str(job_path / "input.mp4")
            shutil.move(str(full), chunk_input)
        else:
            # Compatibilidade com jobs enfileirados antes desta versao.
            chunk_input = slice_video(str(full), str(job_path / "input.mp4"), read_start, read_duration)
        info = probe(chunk_input)
        masks = localize_masks(list(payload.get("masks") or []), read_start, read_duration)

        result = run_pipeline(
            job_id,
            str(payload.get("mode", "subtitle")),
            preset,
            masks,
            None,
            None,
            dict(payload.get("options") or {}),
        )
        processed = job_path / "output.mp4"
        if not processed.exists():
            raise RuntimeError("pipeline não gerou output.mp4")

        # Descarta o contexto de sobreposição: só o miolo vai para a concatenação.
        final = trim_edges(str(processed), str(scratch / f"chunk-{index:04d}.mp4"), head, body)

        metrics = (result or {}).get("metrics") or {}
        final_path = Path(final)
        response = {
            "ok": True,
            "chunk_index": index,
            "seconds": round(time.monotonic() - started, 2),
            "frames": info.frames,
            "residual_text": float(metrics.get("residual_text", 0.0) or 0.0),
            "engine": metrics.get("engine"),
            "device": metrics.get("device"),
            "checksum": _sha256(final_path),
            "bytes": final_path.stat().st_size,
        }
        upload_url = payload.get("upload_url")
        if upload_url:
            _upload(str(upload_url), final_path)
            response["output_url"] = str(payload.get("output_url") or upload_url).split("?")[0]
        else:
            response["output_b64"] = base64.b64encode(final_path.read_bytes()).decode("ascii")
        return response
    except Exception as exc:  # pragma: no cover - caminho de erro do provedor
        return {
            "ok": False,
            "chunk_index": index,
            "seconds": round(time.monotonic() - started, 2),
            "error": f"{type(exc).__name__}: {exc}",
        }
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        shutil.rmtree(job_path, ignore_errors=True)


if __name__ == "__main__":  # pragma: no cover
    import runpod  # type: ignore

    runpod.serverless.start({"handler": handler})
