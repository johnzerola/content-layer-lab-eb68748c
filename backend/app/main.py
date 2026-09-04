from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import threading
import time
from typing import Deque, Dict, List, Literal, Optional
from urllib.parse import unquote

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .config import get_settings
from .engines.diffueraser_official import diffueraser_status
from .engines.inpainting import cuda_available, device_name
from .engines.propainter_official import propainter_status
from .engines.tbe import tbe_status
from .security import TokenError, validate_callback_url, validate_job_token, validate_service_token
from .services.chunking import concat_videos, plan_chunks, slice_video
from .services.media_resolver import MediaResolveError, resolve_public_media
from .services.text_detect import detector_status
from .storage import cleanup_expired, directory_size, job_dir, read_state, write_state
from .render_queue import RenderManager
from .utils.video import mux_audio, probe


SETTINGS = get_settings()
SETTINGS.storage_dir.mkdir(parents=True, exist_ok=True)
JOBS: Dict[str, dict] = {}
ACTIVE_JOBS: set[str] = set()
ACTIVE_LOCK = threading.Lock()
RATE_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
RENDER = RenderManager(
    SETTINGS.storage_dir,
    SETTINGS.worker_secret,
    SETTINGS.callback_origins,
    SETTINGS.max_upload_bytes,
)
MAX_RATE_BUCKETS = 10_000
VIDEO_TYPES = {
    "application/octet-stream",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",
}
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        await asyncio.to_thread(cleanup_expired, SETTINGS.storage_dir, SETTINGS.retention_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    cleanup_expired(SETTINGS.storage_dir, SETTINGS.retention_seconds)
    RENDER.start()
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        RENDER.shutdown()


app = FastAPI(
    title="AI Video Cleaner Worker",
    version="2.1.0",
    docs_url=None if SETTINGS.production else "/docs",
    redoc_url=None if SETTINGS.production else "/redoc",
    openapi_url=None if SETTINGS.production else "/openapi.json",
    lifespan=lifespan,
)

if SETTINGS.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(SETTINGS.allowed_hosts))
if SETTINGS.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(SETTINGS.cors_origins),
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["content-type", "x-file-size", "x-job-token"],
        max_age=600,
    )


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and request.client and request.client.host in {"127.0.0.1", "::1"}:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    now = time.monotonic()
    client_key = _client_key(request)
    if client_key not in RATE_BUCKETS and len(RATE_BUCKETS) >= MAX_RATE_BUCKETS:
        RATE_BUCKETS.pop(next(iter(RATE_BUCKETS)))
    bucket = RATE_BUCKETS[client_key]
    while bucket and bucket[0] <= now - 60:
        bucket.popleft()
    limit = SETTINGS.rate_limit_per_minute
    if len(bucket) >= limit:
        return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
    bucket.append(now)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path not in ("/v1/health", "/ping"):
        response.headers["Cache-Control"] = "no-store"
    return response


def verify_token(job_id: str, token: Optional[str], *scopes: str) -> str:
    try:
        return validate_job_token(SETTINGS.worker_secret, job_id, token, scopes)
    except (TokenError, ValueError):
        raise HTTPException(401, "invalid or expired job token") from None


def _set_state(job_id: str, patch: dict) -> dict:
    directory = job_dir(SETTINGS.storage_dir, job_id)
    state = {**read_state(directory), **JOBS.get(job_id, {}), **patch}
    JOBS[job_id] = state
    write_state(directory, state)
    return state


def _positive_header(value: Optional[str]) -> int:
    if not value:
        return 0
    try:
        parsed = int(value)
    except ValueError:
        raise HTTPException(400, "invalid content length") from None
    return max(0, parsed)


def _validate_video(path: Path) -> dict:
    try:
        info = probe(str(path))
    except Exception as exc:
        raise HTTPException(415, "arquivo nao e um video valido") from exc
    if info.duration <= 0 or info.duration > SETTINGS.max_duration_seconds:
        raise HTTPException(413, f"duracao maxima: {int(SETTINGS.max_duration_seconds)} segundos")
    if info.width > SETTINGS.max_width or info.height > SETTINGS.max_height:
        raise HTTPException(413, f"resolucao maxima: {SETTINGS.max_width}x{SETTINGS.max_height}")
    if info.fps > SETTINGS.max_fps:
        raise HTTPException(413, f"FPS maximo: {SETTINGS.max_fps:g}")
    return {
        "width": info.width,
        "height": info.height,
        "fps": round(info.fps, 3),
        "duration": round(info.duration, 3),
        "frames": info.frames,
        "has_audio": info.has_audio,
    }


class DetectRequest(BaseModel):
    mode: Literal["smart", "subtitle", "text", "karaoke", "watermark", "logo", "object", "passerby"] = "subtitle"
    roi: Optional[dict] = None


class ProcessRequest(BaseModel):
    jobId: Optional[str] = None
    mode: Literal["smart", "subtitle", "text", "karaoke", "watermark", "logo", "object", "passerby"] = "subtitle"
    preset: Literal["fast", "quality", "max"] = "quality"
    masks: List[dict] = Field(default_factory=list, max_length=500)
    options: dict = Field(default_factory=dict)
    callbackUrl: Optional[str] = None


class PlanRequest(BaseModel):
    target_seconds: float = Field(default=15.0, ge=4.0, le=120.0)
    overlap: float = Field(default=0.5, ge=0.0, le=3.0)
    use_scenes: bool = True


class AssemblePart(BaseModel):
    index: int = Field(ge=0, le=4096)
    url: str = Field(min_length=10, max_length=4096)


class AssembleRequest(BaseModel):
    parts: List[AssemblePart] = Field(min_length=1, max_length=512)
    metrics: dict = Field(default_factory=dict)


class MediaResolveRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)


class RenderItemRequest(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=300)
    source_url: Optional[str] = Field(default=None, max_length=2048)
    overrides: dict = Field(default_factory=dict)


class RenderCreateRequest(BaseModel):
    job_id: str
    preset: dict = Field(default_factory=dict)
    callback_url: Optional[str] = Field(default=None, max_length=2048)
    items: List[RenderItemRequest] = Field(min_length=1, max_length=500)


@app.get("/ping")
async def ping():
    # Health check leve para o Load Balancer do RunPod (sem carregar status de GPU).
    return {"ok": True}


@app.get("/v1/health")
async def health():
    propainter = propainter_status(require_cuda=os.getenv("PROPAINTER_ALLOW_CPU", "0") != "1")
    diffueraser = diffueraser_status()
    disk = shutil.disk_usage(SETTINGS.storage_dir)
    return {
        "online": True,
        "ai_ready": propainter.ready,
        "max_ready": diffueraser.ready,
        "cuda": cuda_available(),
        "gpu": device_name(),
        "engines": {
            "propainter": {"ready": propainter.ready, "missing": list(propainter.missing)},
            "diffueraser": {"ready": diffueraser.ready, "missing": list(diffueraser.missing)},
            "temporal_fill": {"ready": True, "quality": "fallback"},
            "tbe": tbe_status(),
        },

        "detectors": {"text": detector_status()},
        "features": {"batch_render": True},
        "limits": {
            "max_upload_bytes": SETTINGS.max_upload_bytes,
            "max_duration_seconds": SETTINGS.max_duration_seconds,
            "max_resolution": [SETTINGS.max_width, SETTINGS.max_height],
            "max_fps": SETTINGS.max_fps,
            "retention_hours": SETTINGS.retention_seconds // 3600,
            "storage_free_bytes": disk.free,
        },
        "version": app.version,
    }


@app.post("/v1/render/jobs")
async def create_render_job(req: RenderCreateRequest, x_job_token: Optional[str] = Header(None)):
    verify_token(req.job_id, x_job_token, "control")
    try:
        return RENDER.create(req.job_id, req.preset, req.callback_url, [item.model_dump() for item in req.items])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/v1/render/items/{item_id}/upload")
async def upload_render_item(
    request: Request,
    item_id: str,
    x_job_token: Optional[str] = Header(None),
    x_file_name: Optional[str] = Header(None),
):
    try:
        batch_id, state, item = RENDER.find_item(item_id)
    except (KeyError, ValueError):
        raise HTTPException(404, "render item not found") from None
    verify_token(batch_id, x_job_token, "upload")
    if item.get("status") not in {"uploading", "failed"}:
        return {"ok": True, "existing": True}
    directory = RENDER.directory(batch_id)
    destination = directory / f"{item_id}.input.mp4"
    temporary = directory / f".{item_id}.upload"
    size = 0
    try:
        with temporary.open("wb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > SETTINGS.max_upload_bytes:
                    raise HTTPException(413, "arquivo excede o limite configurado")
                output.write(chunk)
        if size == 0:
            raise HTTPException(400, "arquivo vazio")
        metadata = _validate_video(temporary)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    item.update(status="queued", progress=0, stage="enviado", size=size, probe=metadata)
    RENDER.write(batch_id, state)
    return {"ok": True, "size": size, "probe": metadata, "name": unquote(x_file_name or item["name"])}


@app.post("/v1/render/jobs/{batch_id}/start")
async def start_render_job(batch_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(batch_id, x_job_token, "control")
    state = RENDER.read(batch_id)
    if not state:
        raise HTTPException(404, "render batch not found")
    missing = [item["id"] for item in state.get("items", []) if not item.get("source_url") and not (RENDER.directory(batch_id) / f"{item['id']}.input.mp4").is_file()]
    if missing:
        raise HTTPException(409, f"{len(missing)} arquivo(s) ainda não enviado(s)")
    state["status"] = "queued"
    RENDER.write(batch_id, state)
    RENDER.enqueue(batch_id)
    return {"ok": True}


@app.get("/v1/render/jobs/{batch_id}")
async def render_job_status(batch_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(batch_id, x_job_token, "control")
    state = RENDER.read(batch_id)
    if not state:
        raise HTTPException(404, "render batch not found")
    return state


@app.post("/v1/render/jobs/{batch_id}/cancel")
async def cancel_render_job(batch_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(batch_id, x_job_token, "control")
    try:
        return RENDER.cancel(batch_id)
    except KeyError:
        raise HTTPException(404, "render batch not found") from None


@app.get("/v1/render/items/{item_id}/result")
async def render_item_result(item_id: str, token: Optional[str] = Query(None)):
    try:
        batch_id, _, item = RENDER.find_item(item_id)
    except (KeyError, ValueError):
        raise HTTPException(404, "render item not found") from None
    verify_token(batch_id, token, "result")
    path = RENDER.directory(batch_id) / f"{item_id}.output.mp4"
    if item.get("status") != "completed" or not path.is_file():
        raise HTTPException(404, "resultado ainda não disponível")
    return FileResponse(path, media_type="video/mp4", filename=item.get("name") or f"{item_id}.mp4")


@app.post("/v1/media/resolve")
async def resolve_media(
    req: MediaResolveRequest, x_service_token: Optional[str] = Header(None)
):
    try:
        validate_service_token(SETTINGS.worker_secret, x_service_token, {"media"})
        return await asyncio.wait_for(
            asyncio.to_thread(
                resolve_public_media,
                req.url,
                SETTINGS.max_upload_bytes,
                SETTINGS.max_duration_seconds,
            ),
            timeout=45,
        )
    except TokenError:
        raise HTTPException(401, "invalid or expired service token") from None
    except asyncio.TimeoutError:
        raise HTTPException(504, "a plataforma demorou demais para responder") from None
    except MediaResolveError as exc:
        raise HTTPException(422, str(exc)) from None


@app.post("/v1/jobs/{job_id}/upload")
async def upload_video(
    request: Request,
    job_id: str,
    file: Optional[UploadFile] = File(None),
    x_job_token: Optional[str] = Header(None),
    x_file_size: Optional[int] = Header(None),
    x_file_name: Optional[str] = Header(None),
):
    verify_token(job_id, x_job_token, "upload")
    if x_file_size is not None and (x_file_size < 1 or x_file_size > SETTINGS.max_upload_bytes):
        raise HTTPException(413, "arquivo excede o limite configurado")
    content_length = _positive_header(request.headers.get("content-length"))
    if content_length > SETTINGS.max_upload_bytes + 2 * 1024 * 1024:
        raise HTTPException(413, "arquivo excede o limite configurado")
    raw_upload = file is None
    filename = unquote((x_file_name or "video.mp4")[:500]) if raw_upload else (file.filename or "")
    suffix = Path(filename).suffix.lower()
    content_type = (
        request.headers.get("content-type", "application/octet-stream")
        if raw_upload
        else (file.content_type or "application/octet-stream")
    ).split(";", 1)[0].lower()
    if suffix not in VIDEO_SUFFIXES or content_type not in VIDEO_TYPES:
        raise HTTPException(415, "formato de video nao permitido")

    cleanup_expired(SETTINGS.storage_dir, SETTINGS.retention_seconds)
    existing = directory_size(SETTINGS.storage_dir)
    disk = shutil.disk_usage(SETTINGS.storage_dir)
    expected = x_file_size or SETTINGS.max_upload_bytes
    if existing + expected > SETTINGS.storage_quota_bytes or disk.free - expected < SETTINGS.min_free_bytes:
        raise HTTPException(507, "quota de armazenamento indisponivel")

    directory = job_dir(SETTINGS.storage_dir, job_id)
    directory.mkdir(parents=True, exist_ok=True)
    if (directory / "input.mp4").is_file():
        raise HTTPException(409, "upload ja concluido para este trabalho")
    temporary = directory / ".input.upload"
    destination = directory / "input.mp4"
    digest = hashlib.sha256()
    size = 0
    try:
        with temporary.open("wb") as buffer:
            if raw_upload:
                chunks = request.stream()
            else:
                async def multipart_chunks():
                    while chunk := await file.read(1024 * 1024):
                        yield chunk

                chunks = multipart_chunks()
            async for chunk in chunks:
                size += len(chunk)
                if size > SETTINGS.max_upload_bytes:
                    raise HTTPException(413, "arquivo excede o limite configurado")
                digest.update(chunk)
                buffer.write(chunk)
        if size == 0:
            raise HTTPException(400, "arquivo vazio")
        metadata = _validate_video(temporary)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        if file is not None:
            await file.close()

    state = _set_state(job_id, {
        "status": "uploaded",
        "progress": 0,
        "stage": "enviado",
        "file_id": digest.hexdigest(),
        "size": size,
        "probe": metadata,
    })
    return {"ok": True, "file_id": state["file_id"], "size": size, "probe": metadata}


@app.get("/v1/jobs/{job_id}/input")
async def input_status(job_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    input_path = directory / "input.mp4"
    state = {**read_state(directory), **JOBS.get(job_id, {})}
    exists = input_path.is_file()
    return {
        "exists": exists,
        "size": input_path.stat().st_size if exists else 0,
        "probe": state.get("probe"),
        "file_id": state.get("file_id"),
    }


@app.post("/v1/jobs/{job_id}/detect")
async def detect(job_id: str, req: DetectRequest, x_job_token: Optional[str] = Header(None)):
    verify_token(job_id, x_job_token, "control")
    if not (job_dir(SETTINGS.storage_dir, job_id) / "input.mp4").is_file():
        raise HTTPException(409, "video ainda nao foi enviado")
    from .workers.tasks import auto_detect

    try:
        regions = auto_detect(job_id, req.mode)
    except Exception as exc:
        raise HTTPException(422, f"falha ao detectar areas: {str(exc)[:300]}") from None
    _set_state(job_id, {"status": "uploaded", "detections": regions})
    return {"regions": regions}


@app.post("/v1/jobs/{job_id}/process")
async def start_process(
    job_id: str,
    req: ProcessRequest,
    background_tasks: BackgroundTasks,
    x_job_token: Optional[str] = Header(None),
):
    verify_token(job_id, x_job_token, "control")
    if req.jobId and req.jobId != job_id:
        raise HTTPException(400, "jobId does not match path")
    try:
        callback_url = validate_callback_url(req.callbackUrl, SETTINGS.callback_origins)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    if not (job_dir(SETTINGS.storage_dir, job_id) / "input.mp4").is_file():
        raise HTTPException(409, "video ainda nao foi enviado")
    with ACTIVE_LOCK:
        if job_id in ACTIVE_JOBS:
            raise HTTPException(409, "job ja esta em processamento")
        if len(ACTIVE_JOBS) >= SETTINGS.max_concurrent_jobs:
            raise HTTPException(429, "capacidade de processamento ocupada; tente novamente")
        ACTIVE_JOBS.add(job_id)
    _set_state(job_id, {"status": "queued", "progress": 0, "stage": "na fila"})

    if SETTINGS.use_celery:
        from .workers.tasks import process_video_task

        task = process_video_task.delay(job_id, req.mode, req.preset, req.masks, callback_url, req.options)
        with ACTIVE_LOCK:
            ACTIVE_JOBS.discard(job_id)
        return {"status": "queued", "job_id": job_id, "task_id": task.id}

    from .workers.tasks import run_pipeline

    def progress_cb(progress: float, stage: str) -> None:
        _set_state(job_id, {"status": "processing", "progress": progress, "stage": stage})

    def run() -> None:
        try:
            result = run_pipeline(job_id, req.mode, req.preset, req.masks, callback_url, progress_cb, req.options)
            _set_state(job_id, result)
        except Exception as exc:
            _set_state(job_id, {"status": "failed", "progress": 0, "error": str(exc)[:1000]})
        finally:
            with ACTIVE_LOCK:
                ACTIVE_JOBS.discard(job_id)

    background_tasks.add_task(run)
    return {"status": "queued", "job_id": job_id}


@app.get("/v1/jobs/{job_id}")
async def job_status(job_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    state = {**read_state(directory), **JOBS.get(job_id, {})}
    return state or {"status": "unknown", "progress": 0}


@app.get("/v1/jobs/{job_id}/source")
async def get_source(job_id: str, token: Optional[str] = Query(None)):
    """Entrada original — consumida pelos workers GPU que processam um chunk."""
    verify_token(job_id, token, "result")
    path = job_dir(SETTINGS.storage_dir, job_id) / "input.mp4"
    if not path.is_file():
        raise HTTPException(404, "video de entrada indisponivel")
    return FileResponse(path, media_type="video/mp4")


@app.get("/v1/jobs/{job_id}/chunks/{chunk_index}/source")
async def get_chunk_source(
    job_id: str,
    chunk_index: int,
    token: Optional[str] = Query(None),
):
    """Serve somente a janela planejada e reutiliza o recorte em retries."""
    verify_token(job_id, token, "result")
    if chunk_index < 0 or chunk_index > 4096:
        raise HTTPException(404, "chunk invalido")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    input_path = directory / "input.mp4"
    plan_path = directory / "gpu-plan.json"
    if not input_path.is_file() or not plan_path.is_file():
        raise HTTPException(404, "plano ou video de entrada indisponivel")
    try:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        chunk = next(item for item in plan["chunks"] if int(item["index"]) == chunk_index)
        start = float(chunk["read_start"])
        duration = float(chunk["read_duration"])
    except (KeyError, TypeError, ValueError, StopIteration, json.JSONDecodeError):
        raise HTTPException(404, "chunk nao pertence ao plano") from None

    cache_dir = directory / "gpu-sources"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / f"chunk-{chunk_index:04d}.mp4"
    if not cached.is_file() or cached.stat().st_size < 1024:
        temporary = cache_dir / f".{cached.name}.{os.getpid()}.{threading.get_ident()}.tmp"
        try:
            await asyncio.to_thread(slice_video, str(input_path), str(temporary), start, duration)
            if temporary.stat().st_size < 1024:
                raise RuntimeError("recorte vazio")
            os.replace(temporary, cached)
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            raise HTTPException(422, f"falha ao preparar chunk: {str(exc)[:200]}") from None
    return FileResponse(cached, media_type="video/mp4", filename=f"chunk-{chunk_index:04d}.mp4")


@app.post("/v1/jobs/{job_id}/plan")
async def plan_job_chunks(job_id: str, req: PlanRequest, x_job_token: Optional[str] = Header(None)):
    """Divide o vídeo em janelas com sobreposição, respeitando cortes de cena."""
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    input_path = directory / "input.mp4"
    if not input_path.is_file():
        raise HTTPException(409, "video ainda nao foi enviado")
    info = await asyncio.to_thread(probe, str(input_path))
    cuts: List[float] = []
    if req.use_scenes:
        from .services.scene import detect_scenes

        try:
            scenes = await asyncio.to_thread(detect_scenes, str(input_path))
            cuts = [float(start) / max(info.fps, 1e-6) for start, _ in scenes]
        except Exception:
            cuts = []
    chunks = plan_chunks(info.duration, req.target_seconds, req.overlap, cuts)
    response = {
        "duration": round(info.duration, 3),
        "fps": round(info.fps, 3),
        "chunks": [
            {
                "index": chunk.index,
                "start": round(chunk.start, 3),
                "end": round(chunk.end, 3),
                "overlap": round(chunk.overlap, 3),
                "read_start": round(chunk.read_start, 3),
                "read_duration": round(min(chunk.read_duration, info.duration - chunk.read_start), 3),
            }
            for chunk in chunks
        ],
    }
    temporary_plan = directory / f".gpu-plan.{os.getpid()}.tmp"
    temporary_plan.write_text(json.dumps(response, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary_plan, directory / "gpu-plan.json")
    shutil.rmtree(directory / "gpu-sources", ignore_errors=True)
    return response


@app.post("/v1/jobs/{job_id}/assemble")
async def assemble_job(job_id: str, req: AssembleRequest, x_job_token: Optional[str] = Header(None)):
    """Baixa os chunks prontos, concatena na ordem e remonta o áudio original."""
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    input_path = directory / "input.mp4"
    if not input_path.is_file():
        raise HTTPException(409, "video de entrada ausente")
    work_dir = directory / "chunks"
    work_dir.mkdir(parents=True, exist_ok=True)

    def build() -> dict:
        import requests as _requests

        parts: List[str] = []
        for order, part in enumerate(sorted(req.parts, key=lambda item: item.index)):
            destination = work_dir / f"part-{order:04d}.mp4"
            with _requests.get(part.url, stream=True, timeout=(30, 1800)) as response:
                response.raise_for_status()
                with destination.open("wb") as handle:
                    for block in response.iter_content(chunk_size=1024 * 1024):
                        if block:
                            handle.write(block)
            if destination.stat().st_size < 1024:
                raise RuntimeError(f"chunk {part.index} veio vazio")
            parts.append(str(destination))
        merged = concat_videos(parts, str(work_dir / "merged.mp4"), str(work_dir))
        info = probe(str(input_path))
        mux_audio(merged, str(input_path), str(directory / "output.mp4"), info.has_audio)
        return {"frames": info.frames, "duration": round(info.duration, 3)}

    try:
        summary = await asyncio.to_thread(build)
    except Exception as exc:
        _set_state(job_id, {"status": "failed", "error": f"falha ao remontar: {str(exc)[:300]}"})
        raise HTTPException(422, f"falha ao remontar: {str(exc)[:300]}") from None
    shutil.rmtree(work_dir, ignore_errors=True)
    state = {
        "status": "completed",
        "progress": 100,
        "stage": "concluido",
        "result_url": f"/v1/jobs/{job_id}/result",
        "metrics": {**(req.metrics or {}), **summary, "engine": "gpu-chunked"},
    }
    _set_state(job_id, state)
    return {"ok": True, **state}



@app.post("/v1/jobs/{job_id}/cancel")
async def cancel(job_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / ".cancel").touch()
    _set_state(job_id, {"status": "cancelled", "stage": "cancelado", "error": None, "progress": 0})
    return {"ok": True}


@app.delete("/v1/jobs/{job_id}")
async def delete_job(job_id: str, x_job_token: Optional[str] = Header(None)):
    verify_token(job_id, x_job_token, "control")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    with ACTIVE_LOCK:
        if job_id in ACTIVE_JOBS:
            raise HTTPException(409, "cancele o processamento antes de excluir")
        JOBS.pop(job_id, None)
    await asyncio.to_thread(shutil.rmtree, directory, True)
    return {"ok": True}


@app.get("/v1/jobs/{job_id}/result")
async def get_result(job_id: str, background_tasks: BackgroundTasks, token: Optional[str] = Query(None)):
    verify_token(job_id, token, "result")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    path = directory / "output.mp4"
    if not path.is_file():
        raise HTTPException(404, "resultado ainda nao disponivel")
    background_tasks.add_task(shutil.rmtree, directory, True)
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Content-Disposition": f'inline; filename="{job_id}-limpo.mp4"'},
    )


@app.get("/v1/jobs/{job_id}/preview")
async def get_preview(job_id: str, token: Optional[str] = Query(None)):
    """Prévia curta (ex.: 5s) — servida sem apagar o diretório do job."""
    verify_token(job_id, token, "result")
    directory = job_dir(SETTINGS.storage_dir, job_id)
    path = directory / "preview.mp4"
    if not path.is_file():
        raise HTTPException(404, "previa ainda nao disponivel")
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Content-Disposition": f'inline; filename="{job_id}-previa.mp4"'},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
