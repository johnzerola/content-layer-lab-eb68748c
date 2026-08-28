from __future__ import annotations

import ipaddress
import json
import queue
import shutil
import socket
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlsplit

import requests

from .security import callback_signature, validate_callback_url
from .storage import job_dir, read_state, write_state
from .utils.video import probe


TERMINAL = {"completed", "failed", "cancelled"}
ACTIVE = {"queued", "uploading", "processing"}
PLATFORMS = {
    "reels": (1080, 1920, 30, "8M"),
    "stories": (1080, 1920, 30, "8M"),
    "shorts": (1080, 1920, 30, "8M"),
    "tiktok": (1080, 1920, 30, "8M"),
    "feed": (1080, 1350, 30, "8M"),
    "youtube": (1920, 1080, 30, "10M"),
}


def _public_url(raw: str) -> str:
    parsed = urlsplit(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("source URL must be public HTTPS")
    for result in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(result[4][0]).is_global:
            raise ValueError("private source URL is not allowed")
    return raw


class RenderManager:
    def __init__(self, storage: Path, secret: str, callback_origins: tuple[str, ...], max_upload: int):
        self.storage = storage
        self.secret = secret
        self.callback_origins = callback_origins
        self.max_upload = max_upload
        self.waiting: queue.Queue[str] = queue.Queue()
        self.enqueued: set[str] = set()
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop.clear()
        self.thread = threading.Thread(target=self._consume, name="batch-render", daemon=True)
        self.thread.start()
        for directory in self.storage.iterdir():
            if not directory.is_dir():
                continue
            state = read_state(directory)
            if state.get("kind") == "render" and state.get("status") in {"queued", "processing"}:
                self.enqueue(directory.name)

    def shutdown(self) -> None:
        self.stop.set()

    def directory(self, batch_id: str) -> Path:
        return job_dir(self.storage, batch_id)

    def read(self, batch_id: str) -> dict:
        return read_state(self.directory(batch_id))

    def write(self, batch_id: str, state: dict) -> dict:
        write_state(self.directory(batch_id), state)
        return state

    def create(self, batch_id: str, preset: dict, callback_url: Optional[str], items: list[dict]) -> dict:
        uuid.UUID(batch_id)
        callback = validate_callback_url(callback_url, self.callback_origins)
        if not 1 <= len(items) <= 500:
            raise ValueError("batch must contain 1 to 500 items")
        directory = self.directory(batch_id)
        if (directory / "state.json").exists():
            state = self.read(batch_id)
            return {"ok": True, "queued": len(state.get("items", [])), "existing": True}
        clean_items = []
        seen = set()
        for raw in items:
            item_id = str(raw.get("id", ""))
            uuid.UUID(item_id)
            if item_id in seen:
                raise ValueError("duplicate item id")
            seen.add(item_id)
            source = raw.get("source_url")
            clean_items.append({
                "id": item_id,
                "name": str(raw.get("name") or "video.mp4")[:300],
                "source_url": _public_url(source) if source else None,
                "overrides": raw.get("overrides") if isinstance(raw.get("overrides"), dict) else {},
                "status": "queued" if source else "uploading",
                "progress": 0,
                "stage": "aguardando envio" if not source else "na fila",
                "error": None,
                "result_url": None,
            })
        state = {
            "kind": "render", "job_id": batch_id, "status": "uploading",
            "preset": preset, "callback_url": callback, "items": clean_items,
            "done": 0, "errors": 0,
        }
        self.write(batch_id, state)
        return {"ok": True, "queued": len(clean_items)}

    def find_item(self, item_id: str) -> tuple[str, dict, dict]:
        uuid.UUID(item_id)
        for directory in self.storage.iterdir():
            if not directory.is_dir():
                continue
            state = read_state(directory)
            if state.get("kind") != "render":
                continue
            for item in state.get("items", []):
                if item.get("id") == item_id:
                    return directory.name, state, item
        raise KeyError(item_id)

    def enqueue(self, batch_id: str) -> None:
        with self.lock:
            if batch_id in self.enqueued:
                return
            self.enqueued.add(batch_id)
            self.waiting.put(batch_id)

    def cancel(self, batch_id: str) -> dict:
        state = self.read(batch_id)
        if not state:
            raise KeyError(batch_id)
        (self.directory(batch_id) / ".cancel").touch()
        for item in state.get("items", []):
            if item.get("status") not in TERMINAL:
                item.update(status="cancelled", stage="cancelado")
        state.update(status="cancelled")
        self.write(batch_id, state)
        self._notify(state, {"job_id": batch_id, "status": "cancelled"})
        return {"ok": True}

    def _notify(self, state: dict, payload: dict) -> None:
        callback = state.get("callback_url")
        if not callback:
            return
        try:
            callback = validate_callback_url(callback, self.callback_origins)
            body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
            stamp = str(int(time.time()))
            requests.post(callback, data=body, headers={
                "content-type": "application/json",
                "x-callback-timestamp": stamp,
                "x-signature": callback_signature(self.secret, stamp, body),
            }, timeout=8, allow_redirects=False)
        except Exception as exc:
            print(f"[render-callback] {type(exc).__name__}")

    def _save_item(self, batch_id: str, item_id: str, patch: dict) -> dict:
        state = self.read(batch_id)
        for item in state.get("items", []):
            if item.get("id") == item_id:
                item.update(patch)
                payload = {"job_id": batch_id, "item_id": item_id, **patch}
                self.write(batch_id, state)
                self._notify(state, payload)
                return state
        raise KeyError(item_id)

    def _download(self, url: str, destination: Path) -> None:
        with requests.get(_public_url(url), stream=True, timeout=(10, 60), allow_redirects=False) as response:
            response.raise_for_status()
            size = 0
            with destination.open("wb") as output:
                for chunk in response.iter_content(1024 * 1024):
                    size += len(chunk)
                    if size > self.max_upload:
                        raise ValueError("source exceeds upload limit")
                    output.write(chunk)

    def _ffmpeg(self, batch_id: str, item: dict, source: Path, output: Path, emit: Callable[[float, str], None]) -> None:
        info = probe(str(source))
        preset = self.read(batch_id).get("preset", {})
        platforms = preset.get("platforms") if isinstance(preset, dict) else None
        platform = str(platforms[0]) if isinstance(platforms, list) and platforms else "reels"
        width, height, fps, bitrate = PLATFORMS.get(platform, PLATFORMS["reels"])
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps={fps}"
        )
        command = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
            "-map", "0:v:0", "-map", "0:a?", "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-maxrate", bitrate,
            "-bufsize", "16M", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-progress", "pipe:1",
            "-nostats", str(output),
        ]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        last = -1
        assert process.stdout is not None
        for line in process.stdout:
            if (self.directory(batch_id) / ".cancel").exists():
                process.terminate()
                raise RuntimeError("cancelled")
            if line.startswith("out_time_ms="):
                rendered = int(line.split("=", 1)[1] or 0) / 1_000_000
                progress = min(98, max(1, round(rendered / max(info.duration, .1) * 100)))
                if progress >= last + 2:
                    last = progress
                    emit(progress, "renderizando")
        stderr = process.stderr.read() if process.stderr else ""
        if process.wait() != 0:
            raise RuntimeError(stderr[-600:] or "FFmpeg failed")

    def _run_batch(self, batch_id: str) -> None:
        state = self.read(batch_id)
        if not state or state.get("status") == "cancelled":
            return
        state["status"] = "processing"
        self.write(batch_id, state)
        self._notify(state, {"job_id": batch_id, "status": "processing"})
        directory = self.directory(batch_id)
        done = errors = 0
        for item in state.get("items", []):
            if (directory / ".cancel").exists():
                return
            item_id = item["id"]
            source = directory / f"{item_id}.input.mp4"
            output = directory / f"{item_id}.output.mp4"
            try:
                self._save_item(batch_id, item_id, {"status": "processing", "progress": 1, "stage": "preparando"})
                if not source.is_file():
                    if not item.get("source_url"):
                        raise RuntimeError("arquivo não foi enviado")
                    self._download(item["source_url"], source)
                self._ffmpeg(batch_id, item, source, output,
                    lambda progress, stage: self._save_item(batch_id, item_id, {
                        "status": "processing", "progress": progress, "stage": stage,
                    }))
                done += 1
                self._save_item(batch_id, item_id, {
                    "status": "completed", "progress": 100, "stage": "pronto",
                    "result_url": f"/v1/render/items/{item_id}/result",
                    "result_path": f"/v1/render/items/{item_id}/result",
                })
            except Exception as exc:
                if str(exc) == "cancelled":
                    return
                errors += 1
                self._save_item(batch_id, item_id, {
                    "status": "failed", "progress": 100, "stage": "falhou", "error": str(exc)[:1000],
                })
        state = self.read(batch_id)
        state.update(status="completed" if errors == 0 else "failed", done=done, errors=errors)
        self.write(batch_id, state)
        self._notify(state, {"job_id": batch_id, "status": state["status"], "done": done, "errors": errors})

    def _consume(self) -> None:
        while not self.stop.is_set():
            try:
                batch_id = self.waiting.get(timeout=1)
            except queue.Empty:
                continue
            try:
                self._run_batch(batch_id)
            finally:
                with self.lock:
                    self.enqueued.discard(batch_id)
                self.waiting.task_done()
