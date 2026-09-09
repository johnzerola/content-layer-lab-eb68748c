"""Bounded, authenticated audio-only separation. No RunPod allocation.

Run the API with one worker process. Demucs is optional and runs in its own
subprocess; importing this module never downloads weights or imports torch.
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from fastapi.responses import FileResponse

from .security import validate_job_token, TokenError
from .storage import job_dir, read_state, write_state, cleanup_expired, directory_size

MAX_SECONDS = 180
MAX_BYTES = 64 * 1024 * 1024
MODEL = "htdemucs"
def separation_settings() -> tuple[str, int, float]:
    quality = os.getenv("AUDIO_SEPARATION_QUALITY", "fast").lower()
    if quality not in {"fast", "quality"}:
        quality = "fast"
    model = os.getenv("AUDIO_SEPARATION_MODEL", "htdemucs_ft" if quality == "quality" else MODEL)
    shifts = int(os.getenv("AUDIO_SEPARATION_SHIFTS", "1" if quality == "quality" else "0"))
    overlap = float(os.getenv("AUDIO_SEPARATION_OVERLAP", "0.5" if quality == "quality" else "0.25"))
    if model not in {"htdemucs", "htdemucs_ft", "mdx_extra", "mdx_extra_q"}:
        model = MODEL
    return model, max(0, min(2, shifts)), max(0.1, min(0.75, overlap))
NOTICE = "Pode haver resíduos de música; canto pode permanecer junto da fala."


def capabilities():
    enabled = os.getenv("AUDIO_SEPARATION_ENABLED", "0") == "1"
    installed = importlib.util.find_spec("demucs") is not None
    model, shifts, overlap = separation_settings()
    quality = os.getenv("AUDIO_SEPARATION_QUALITY", "fast").lower()
    if quality not in {"fast", "quality"}:
        quality = "fast"
    ensemble = os.getenv("AUDIO_SEPARATION_ENSEMBLE", "0") == "1"
    return {"ready": enabled and installed and bool(shutil.which("ffmpeg"))
            and bool(shutil.which("ffprobe")), "engine": "demucs", "model": model,
            "device": "cpu", "quality": quality,
            "profiles": {"fast": {"model": "htdemucs", "interactive": True},
                         "quality": {"model": "htdemucs_ft", "interactive": False}},
            "ensemble": {"enabled": ensemble, "model": os.getenv("AUDIO_SEPARATION_ENSEMBLE_MODEL", "mdx_extra"),
                         "requiresBenchmark": True},
            "threads": max(1, min(16, int(os.getenv("AUDIO_SEPARATION_THREADS", "2")))),
            "timeout_seconds": max(60, min(3600, int(os.getenv("AUDIO_SEPARATION_TIMEOUT_SECONDS", "900")))),
            "shifts": shifts, "overlap": overlap, "losslessIntermediate": True,
            "max_duration": MAX_SECONDS, "max_bytes": MAX_BYTES,
            "notice": NOTICE}


def audio_info(path: Path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,channels,sample_rate", "-of", "json", str(path),
    ], capture_output=True, text=True, check=True, timeout=20)
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    duration = float(data.get("format", {}).get("duration", 0))
    if len(streams) != 1 or streams[0].get("codec_type") != "audio":
        raise ValueError("Envie apenas o áudio WAV do vídeo.")
    if not math.isfinite(duration) or not 0 < duration <= MAX_SECONDS + 0.1:
        raise ValueError(f"O áudio precisa ter até {MAX_SECONDS} segundos.")
    if int(streams[0].get("channels", 0)) not in (1, 2):
        raise ValueError("Use áudio mono ou estéreo.")
    if int(streams[0].get("sample_rate", 0)) != 44100:
        raise ValueError("Use áudio em 44.100 Hz.")
    return duration


def command(source: Path, output: Path):
    model, shifts, overlap = separation_settings()
    return [sys.executable, "-m", "demucs.separate", "-n", model,
            "--two-stems", "vocals", "--device", "cpu", "--shifts", str(shifts),
            "--segment", "7", "--overlap", str(overlap), "-j", "0",
            "--float32", "-o", str(output), str(source)]


def mix_command(first: Path, second: Path, output: Path):
    """Average two lossless stems without invoking a shell."""
    return ["ffmpeg", "-y", "-v", "error", "-i", str(first), "-i", str(second),
            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=1",
            "-c:a", "pcm_f32le", str(output)]


def stop_process(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    process.wait(timeout=15)


def separate(directory: Path, cancel: threading.Event):
    source = directory / "input.wav"
    duration = audio_info(source)
    output = directory / "separated"
    threads = max(1, min(16, int(os.getenv("AUDIO_SEPARATION_THREADS", "2"))))
    env = {**os.environ, "OMP_NUM_THREADS": str(threads), "MKL_NUM_THREADS": str(threads)}
    # Scope model cache/offline mode to Demucs, not OCR or other worker engines.
    if os.getenv("AUDIO_MODEL_CACHE"):
        env["HF_HOME"] = os.environ["AUDIO_MODEL_CACHE"]
    if os.getenv("AUDIO_MODEL_OFFLINE", "0") == "1":
        env["HF_HUB_OFFLINE"] = "1"
    # No CPU/GPU fallback cascade and no retry after a model error.
    timeout_seconds = max(60, min(3600, int(os.getenv("AUDIO_SEPARATION_TIMEOUT_SECONDS", "900"))))
    deadline = time.monotonic() + timeout_seconds
    with (directory / "engine.log").open("wb") as log:
        process = subprocess.Popen(command(source, output), stdout=log, stderr=log,
                                   env=env, start_new_session=os.name != "nt")
        try:
            while process.poll() is None:
                if cancel.wait(0.25):
                    raise RuntimeError("Separação cancelada.")
                if time.monotonic() >= deadline:
                    raise TimeoutError("Separação excedeu 15 minutos. Tente um trecho menor.")
            if cancel.is_set():
                raise RuntimeError("Separação cancelada.")
            if process.returncode != 0:
                raise RuntimeError("Demucs falhou. Consulte engine.log no servidor; o original foi preservado.")
        finally:
            stop_process(process)
    model, _, _ = separation_settings()
    if os.getenv("AUDIO_SEPARATION_ENSEMBLE", "0") == "1":
        ensemble_model = os.getenv("AUDIO_SEPARATION_ENSEMBLE_MODEL", "mdx_extra")
        if ensemble_model not in {"mdx_extra", "mdx_extra_q", "mdx_q"}:
            raise RuntimeError("Modelo de ensemble não permitido.")
        second_output = directory / "separated-ensemble"
        with (directory / "ensemble.log").open("wb") as log:
            process = subprocess.Popen(
                [sys.executable, "-m", "demucs.separate", "-n", ensemble_model,
                 "--two-stems", "vocals", "--device", "cpu", "--shifts", "0",
                 "--segment", "7", "--overlap", "0.25", "-j", "0", "--float32",
                 "-o", str(second_output), str(source)], stdout=log, stderr=log,
                 env=env, start_new_session=os.name != "nt")
            try:
                while process.poll() is None:
                    if cancel.wait(0.25):
                        raise RuntimeError("Separação cancelada.")
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Ensemble excedeu 15 minutos.")
                if process.returncode != 0:
                    raise RuntimeError("A segunda passagem MDX falhou; a saída primária foi preservada.")
            finally:
                stop_process(process)
        for stem in ("vocals", "no_vocals"):
            primary = output / model / "input" / f"{stem}.wav"
            secondary = second_output / ensemble_model / "input" / f"{stem}.wav"
            if not secondary.is_file():
                raise RuntimeError("O ensemble MDX não produziu as duas trilhas.")
            mixed = directory / f"ensemble-{stem}.wav"
            subprocess.run(mix_command(primary, secondary, mixed), check=True, timeout=120)
            shutil.copyfile(mixed, primary)
    for stem in ("vocals", "no_vocals"):
        path = output / model / "input" / f"{stem}.wav"
        if not path.is_file() or path.stat().st_size < 128:
            raise RuntimeError("O motor não produziu as duas trilhas.")
        if abs(audio_info(path) - duration) > 0.15:
            raise RuntimeError("Duração das trilhas divergente; saída não aprovada.")
    return duration


class AudioSeparation:
    def __init__(self, settings):
        self.settings = settings
        self.root = settings.storage_dir / "audio-stems"
        self.slot = threading.Lock()
        self.active: dict[str, threading.Event] = {}
        self.router = APIRouter(prefix="/v1/audio", tags=["audio"])
        self._routes()

    def cleanup(self):
        cleanup_expired(self.root, self.settings.retention_seconds)

    def recover(self):
        if self.root.exists():
            for directory in self.root.iterdir():
                if directory.is_dir() and read_state(directory).get("status") in ("processing", "uploading"):
                    write_state(directory, {"status": "failed", "error": "Servidor reiniciado; tarefa interrompida."})

    def directory(self, job_id, token, scope):
        try:
            validate_job_token(self.settings.worker_secret, job_id, token, (scope,))
            return job_dir(self.root, job_id)
        except (TokenError, ValueError):
            raise HTTPException(401, "Token de áudio inválido ou expirado.") from None

    def run(self, job_id, directory, event):
        started = time.monotonic()
        try:
            write_state(directory, {"status": "processing", "stage": "separating"})
            duration = separate(directory, event)
            model, shifts, overlap = separation_settings()
            quality = os.getenv("AUDIO_SEPARATION_QUALITY", "fast").lower()
            write_state(directory, {"status": "completed", "duration": duration,
                                    "engine": "demucs", "model": model, "shifts": shifts,
                                    "overlap": overlap, "quality": quality if quality in {"fast", "quality"} else "fast",
                                    "ensemble": os.getenv("AUDIO_SEPARATION_ENSEMBLE", "0") == "1",
                                    "processing_seconds": round(time.monotonic() - started, 3),
                                    "format": "wav", "notice": NOTICE})
        except Exception as exc:
            # Only safe, controlled diagnostics are exposed. Engine logs stay private.
            message = str(exc) if isinstance(exc, (RuntimeError, TimeoutError, ValueError)) else "Falha ao separar o áudio."
            write_state(directory, {"status": "cancelled" if event.is_set() else "failed",
                                    "error": message})
        finally:
            self.active.pop(job_id, None)
            self.slot.release()

    def _routes(self):
        router = self.router

        @router.get("/capabilities")
        def available():
            return capabilities()

        @router.post("/jobs/{job_id}/upload")
        async def upload(job_id: str, request: Request, x_job_token: str = Header(default="")):
            directory = self.directory(job_id, x_job_token, "upload")
            if not capabilities()["ready"]:
                raise HTTPException(503, "Demucs não está habilitado neste servidor.")
            if not self.slot.acquire(blocking=False):
                raise HTTPException(429, "Há outra separação em andamento. Aguarde.")
            created = False
            try:
                if directory.exists():
                    raise HTTPException(409, "Este upload já existe; crie outro trabalho.")
                if shutil.disk_usage(self.settings.storage_dir).free < self.settings.min_free_bytes + MAX_BYTES * 4:
                    raise HTTPException(507, "Espaço insuficiente para separar áudio.")
                if directory_size(self.settings.storage_dir) + MAX_BYTES * 4 > self.settings.storage_quota_bytes:
                    raise HTTPException(507, "Cota de armazenamento atingida.")
                directory.mkdir(parents=True)
                created = True
                write_state(directory, {"status": "uploading"})
                size = 0
                with (directory / "input.wav").open("xb") as target:
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise HTTPException(413, "Áudio excede 64 MB.")
                        target.write(chunk)
                try:
                    # Check the actual format, not the request's MIME label.
                    with (directory / "input.wav").open("rb") as source:
                        header = source.read(12)
                    if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
                        raise ValueError("Formato inválido: envie WAV.")
                    duration = audio_info(directory / "input.wav")
                except (ValueError, subprocess.SubprocessError, KeyError):
                    raise HTTPException(422, "WAV inválido: use mono/estéreo, 44.100 Hz e até 3 minutos.") from None
                write_state(directory, {"status": "uploaded", "duration": duration})
                return {"status": "uploaded", "duration": duration}
            except BaseException:
                if created:
                    # Exact app-created job only; never remove an existing upload.
                    (directory / "input.wav").unlink(missing_ok=True)
                    write_state(directory, {"status": "failed", "error": "Upload incompleto ou inválido."})
                raise
            finally:
                self.slot.release()

        @router.post("/jobs/{job_id}/start")
        def start(job_id: str, background: BackgroundTasks, x_job_token: str = Header(default="")):
            directory = self.directory(job_id, x_job_token, "control")
            if not capabilities()["ready"]:
                raise HTTPException(503, "Demucs indisponível; nenhum processamento foi iniciado.")
            if not self.slot.acquire(blocking=False):
                raise HTTPException(429, "Há outra separação em andamento. Aguarde.")
            try:
                if read_state(directory).get("status") != "uploaded":
                    raise HTTPException(409, "Envie o áudio antes de iniciar; trabalhos não são repetidos automaticamente.")
                event = threading.Event()
                self.active[job_id] = event
                write_state(directory, {"status": "processing", "stage": "starting"})
                background.add_task(self.run, job_id, directory, event)
            except BaseException:
                self.active.pop(job_id, None)
                self.slot.release()
                raise
            return {"status": "processing"}

        @router.get("/jobs/{job_id}")
        def status(job_id: str, x_job_token: str = Header(default="")):
            directory = self.directory(job_id, x_job_token, "control")
            state = read_state(directory)
            if not state:
                raise HTTPException(404, "Trabalho não encontrado.")
            if state.get("status") == "processing" and job_id not in self.active:
                state = {"status": "failed", "error": "Servidor reiniciado; separação interrompida."}
                write_state(directory, state)
            return state

        @router.post("/jobs/{job_id}/cancel")
        def cancel(job_id: str, x_job_token: str = Header(default="")):
            directory = self.directory(job_id, x_job_token, "control")
            if job_id in self.active:
                self.active[job_id].set()
            elif read_state(directory).get("status") == "uploaded":
                write_state(directory, {"status": "cancelled"})
            return {"cancel_requested": True}

        @router.get("/jobs/{job_id}/stems/{stem}")
        def download(job_id: str, stem: Literal["voice", "music"], x_job_token: str = Header(default="")):
            directory = self.directory(job_id, x_job_token, "result")
            if read_state(directory).get("status") != "completed":
                raise HTTPException(409, "As duas trilhas ainda não estão prontas.")
            name = "vocals" if stem == "voice" else "no_vocals"
            model = read_state(directory).get("model") or separation_settings()[0]
            return FileResponse(directory / "separated" / model / "input" / f"{name}.wav",
                                media_type="audio/wav", filename=f"{stem}.wav")
