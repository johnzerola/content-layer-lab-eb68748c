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
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import traceback
import uuid

import requests

from app.services.chunking import localize_masks, slice_video, trim_edges
from app.engines.diffueraser_official import diffueraser_status
from app.engines.propainter_official import propainter_status
from app.storage import job_dir as safe_job_dir
from app.utils.video import probe
from app.utils.video import ffmpeg_filter
from app.workers.tasks import run_pipeline
from app.observability import FailureDiagnostics

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


def _upload_artifact(spec: dict, path: Path) -> dict:
    """Upload one opt-in evidence artifact without exposing its credential."""
    method = str(spec.get("method") or "POST").upper()
    headers = {
        "content-type": "video/mp4",
        "x-file-name": str(spec.get("filename") or path.name),
        "x-file-size": str(path.stat().st_size),
    }
    if spec.get("token"):
        headers["x-job-token"] = str(spec["token"])
    with path.open("rb") as handle:
        response = requests.request(method, str(spec["url"]), data=handle,
                                    headers=headers, timeout=DOWNLOAD_TIMEOUT)
    response.raise_for_status()
    return {
        "bytes": path.stat().st_size,
        "sha256": _sha256(path),
        "output_url": str(spec.get("output_url") or spec["url"]).split("?")[0],
    }


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _read_text_bounded(path: Path, limit: int = 512 * 1024) -> dict:
    if not path.is_file():
        return {"text": None, "bytes": None, "truncated": False}
    data = path.read_bytes()
    return {
        "text": data[-limit:].decode("utf-8", errors="replace"),
        "bytes": len(data),
        "truncated": len(data) > limit,
    }


def _upload_available_artifacts(specs: dict, candidates: dict[str, Path]) -> dict:
    uploaded = {}
    for name, spec in specs.items():
        candidate = candidates.get(name)
        if candidate is None or not candidate.is_file():
            uploaded[name] = {"error": "artifact_missing"}
            continue
        try:
            uploaded[name] = _upload_artifact(dict(spec), candidate)
        except Exception as exc:  # evidence transport must not hide the pipeline failure
            uploaded[name] = {"error": f"{type(exc).__name__}: {exc}"}
    return uploaded


WORKER_VERSION = "v4"
PIPELINE_REVISION = "scene-roi-v4"


def _gpu_name():
    try:
        import torch
        return torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    except Exception:
        return None


def handler(event: dict) -> dict:
    payload = (event or {}).get("input") or {}
    started = time.monotonic()
    index = int(payload.get("chunk_index", 0))
    if payload.get("expected_revision") not in (None, PIPELINE_REVISION):
        return {"ok": False, "error": "revisao de processamento incompativel",
                "pipeline_revision": PIPELINE_REVISION}
    if str(payload.get("action") or "") == "health":
        propainter = propainter_status(require_cuda=True)
        diffueraser = diffueraser_status()
        return {
            "ok": True,
            "worker_version": WORKER_VERSION,
            "pipeline_revision": PIPELINE_REVISION,
            "gpu_name": _gpu_name(),
            "inference_roi": os.getenv("CLEANER_INFERENCE_ROI", "1") == "1",
            "gpu_vram_gb": _gpu_vram_gb(),
            "ai_ready": propainter.ready,
            "max_ready": diffueraser.ready,
            "engines": {
                "propainter": propainter.as_dict(),
                "diffueraser": diffueraser.as_dict(),
            },
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
    body = end - start
    if body <= 0:
        return {"ok": False, "chunk_index": index, "error": "intervalo do trecho invalido"}
    read_duration = (end + overlap) - read_start

    job_id = str(uuid.uuid4())
    job_path = safe_job_dir(STORAGE_DIR, job_id)
    job_path.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix=f"chunk-{index}-"))
    options = dict(payload.get("options") or {})
    artifact_uploads = dict(payload.get("artifact_uploads") or {})
    diagnostics = FailureDiagnostics(job_id, STORAGE_DIR, {
        "commit": os.getenv("CLEANER_BUILD_COMMIT", "unknown"),
        "image_digest": os.getenv("CLEANER_IMAGE_DIGEST", "unknown"),
        "pipeline_revision": PIPELINE_REVISION,
        "worker_version": WORKER_VERSION,
        "engine": options.get("engine", "auto"),
        "quality_profile": options.get("quality_profile", "standard"),
        "preset": preset,
        "mode": str(payload.get("mode", "subtitle")),
    })
    try:
        with diagnostics.stage("01_download", source_url="redacted"):
            full = _download(source_url, scratch / "source.mp4")
        # Só o trecho necessário (miolo + contexto) entra na pipeline.
        if source_is_chunk:
            chunk_input = str(job_path / "input.mp4")
            shutil.move(str(full), chunk_input)
        else:
            # Compatibilidade com jobs enfileirados antes desta versao.
            chunk_input = slice_video(str(full), str(job_path / "input.mp4"), read_start, read_duration)
        with diagnostics.stage("02_probe"):
            info = probe(chunk_input)
        diagnostics.update("geometry", input_width=info.width, input_height=info.height,
                           fps=info.fps, frame_count=info.frames, duration=info.duration)
        masks = localize_masks(list(payload.get("masks") or []), read_start, read_duration)
        options["_failure_diagnostics"] = diagnostics

        result = run_pipeline(
            job_id,
            str(payload.get("mode", "subtitle")),
            preset,
            masks,
            None,
            None,
            options,
        )
        processed = job_path / "output.mp4"
        if not processed.exists():
            raise RuntimeError("pipeline não gerou output.mp4")

        # Descarta o contexto de sobreposição: só o miolo vai para a concatenação.
        processed_info = probe(str(processed))
        if abs(processed_info.duration - info.duration) > max(0.1, 2 / info.fps):
            raise RuntimeError("motor alterou a duracao do trecho")
        if (processed_info.width, processed_info.height) != (info.width, info.height):
            raise RuntimeError("motor alterou o enquadramento do trecho")
        # No overlap at scene boundaries: avoid an unnecessary extra encode.
        if head <= 0.001 and abs(processed_info.duration - body) <= 1 / info.fps:
            final = str(processed)
        else:
            final = trim_edges(str(processed), str(scratch / f"chunk-{index:04d}.mp4"), head, body)

        metrics = (result or {}).get("metrics") or {}
        final_path = Path(final)
        response = {
            "ok": True,
            "chunk_index": index,
            "processing_seconds": round(time.monotonic() - started, 2),
            "pipeline_revision": PIPELINE_REVISION,
            "gpu_name": _gpu_name(),
            "timing_scope": "handler_download_process_upload_excludes_worker_start_and_idle",
            "frames": info.frames,
            "residual_text": float(metrics.get("residual_text", 0.0) or 0.0),
            "quality_status": metrics.get("quality_status", "unverified"),
            "quality_issues": metrics.get("quality_issues", []),
            "alternative_attempts": metrics.get("alternative_attempts", 0),
            "selected_engine": metrics.get("selected_engine"),
            "engine": metrics.get("engine"),
            "quality_profile": metrics.get("quality_profile"),
            "profile_contract": metrics.get("profile_contract"),
            "device": metrics.get("device"),
            "checksum": _sha256(final_path),
            "bytes": final_path.stat().st_size,
        }
        run_dir = job_path / "diffueraser-run"
        junction_dir = job_path / "subtitle-junctions"
        response["diffueraser_report"] = _read_json(run_dir / "diffueraser.report.json")
        response["subtitle_junctions_report"] = _read_json(
            junction_dir / "subtitle-junctions.report.json"
        )
        response["diffueraser_stdout"] = _read_text_bounded(
            run_dir / "diffueraser.stdout.log"
        )
        response["diffueraser_stderr"] = _read_text_bounded(
            run_dir / "diffueraser.stderr.log"
        )
        upload_url = payload.get("upload_url")
        with diagnostics.stage("14_upload", method="evidence_uploads" if artifact_uploads else (
                "signed_put" if upload_url else "inline_base64")):
            if artifact_uploads:
                delivery = Path(ffmpeg_filter(
                    str(final_path), str(job_path / "delivery-crf14.mp4"), "null", crf=14
                ))
                candidates = {
                    "diffueraser_upstream": run_dir / "diffueraser_result.mp4",
                    "diffueraser_pure": job_path / "diffueraser-native.mp4",
                    "junctions": diagnostics.destination / "checkpoints" / "11-subtitle-junctions-master.mp4",
                    "master_lossless": final_path,
                    "delivery_final": delivery,
                }
                response["artifacts"] = _upload_available_artifacts(artifact_uploads, candidates)
            if upload_url:
                _upload(str(upload_url), final_path)
                response["output_url"] = str(payload.get("output_url") or upload_url).split("?")[0]
            elif not artifact_uploads:
                response["output_b64"] = base64.b64encode(final_path.read_bytes()).decode("ascii")
        diagnostics.capture_success()
        response.update(diagnostics.response())
        response["seconds"] = round(time.monotonic() - started, 2)
        return response
    except Exception as exc:  # pragma: no cover - caminho de erro do provedor
        diagnostics.capture_failure(job_path, exc, traceback.format_exc())
        run_dir = job_path / "diffueraser-run"
        junction_dir = job_path / "subtitle-junctions"
        failure = {
            "ok": False,
            "chunk_index": index,
            "seconds": round(time.monotonic() - started, 2),
            "error": f"{type(exc).__name__}: {exc}",
            "diffueraser_report": _read_json(run_dir / "diffueraser.report.json"),
            "subtitle_junctions_report": _read_json(
                junction_dir / "subtitle-junctions.report.json"
            ),
            "diffueraser_stdout": _read_text_bounded(run_dir / "diffueraser.stdout.log"),
            "diffueraser_stderr": _read_text_bounded(run_dir / "diffueraser.stderr.log"),
        }
        if artifact_uploads:
            checkpoint_dir = diagnostics.destination / "checkpoints"
            failure["artifacts"] = _upload_available_artifacts(artifact_uploads, {
                "diffueraser_upstream": checkpoint_dir / "08-diffueraser-output.mp4",
                "diffueraser_pure": checkpoint_dir / "10-diffueraser-native.mp4",
                "junctions": checkpoint_dir / "11-subtitle-junctions-master.mp4",
                "master_lossless": job_path / "output.mp4",
                "delivery_final": job_path / "delivery-crf14.mp4",
            })
        failure.update(diagnostics.response())
        return failure
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        shutil.rmtree(job_path, ignore_errors=True)


if __name__ == "__main__":  # pragma: no cover
    import runpod  # type: ignore

    runpod.serverless.start({"handler": handler})
