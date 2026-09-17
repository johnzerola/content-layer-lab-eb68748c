"""Authenticated loopback HTTP relay for the local CUDA voice worker."""
import base64
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
import uuid

HOST = os.environ.get("CHATSCENE_GPU_BIND", "127.0.0.1")
PORT = int(os.environ.get("CHATSCENE_GPU_PORT", "18096"))
TOKEN = os.environ.get("CHATSCENE_GPU_TOKEN", "")
CONFIG = Path(os.environ.get("CHATSCENE_VOICE_CONFIG", "backend/data/chatscene-voices/runtime.json")).resolve()
WORKER = Path(os.environ.get("CHATSCENE_VOICE_WORKER", "backend/chatscene_voice/worker.py")).resolve()
MAX_BODY = 16 * 1024 * 1024
IDLE_SECONDS = int(os.environ.get("CHATSCENE_GPU_IDLE_SECONDS", "120"))


class VoiceWorker:
    def __init__(self):
        self.process = subprocess.Popen(
            [os.environ.get("CHATSCENE_VOICE_PYTHON_PATH", "python"), "-u", str(WORKER), str(CONFIG)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        ready_line = self.process.stdout.readline()
        ready = json.loads(ready_line) if ready_line else {}
        if not ready.get("ready"):
            self.close()
            raise RuntimeError("voice worker did not become ready")

    def synthesize(self, text, reference):
        if self.process.poll() is not None:
            raise RuntimeError("voice worker exited")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
            temp.write(reference)
            reference_path = temp.name
        try:
            request = {"id": str(uuid.uuid4()), "text": text, "referencePath": reference_path}
            self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
            response_line = self.process.stdout.readline()
            result = json.loads(response_line) if response_line else {}
            if result.get("error") or not result.get("audio"):
                raise RuntimeError("voice synthesis failed")
            return result
        finally:
            try:
                Path(reference_path).unlink()
            except OSError:
                pass

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()


class WorkerManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.worker = None
        self.idle_timer = None

    @property
    def loaded(self):
        return self.worker is not None and self.worker.process.poll() is None

    def synthesize(self, text, reference):
        with self.lock:
            if self.idle_timer:
                self.idle_timer.cancel()
                self.idle_timer = None
            if not self.loaded:
                self.worker = VoiceWorker()
            try:
                return self.worker.synthesize(text, reference)
            except Exception:
                self._close_locked()
                raise
            finally:
                if self.loaded:
                    self.idle_timer = threading.Timer(IDLE_SECONDS, self.close)
                    self.idle_timer.daemon = True
                    self.idle_timer.start()

    def _close_locked(self):
        if self.idle_timer:
            self.idle_timer.cancel()
            self.idle_timer = None
        if self.worker:
            self.worker.close()
            self.worker = None

    def close(self):
        with self.lock:
            self._close_locked()


class Handler(BaseHTTPRequestHandler):
    server_version = "ChatSceneGPU/1"

    def log_message(self, *_args):
        return

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        payload = json.dumps({"ready": True, "device": "cuda", "modelLoaded": self.server.worker_manager.loaded}).encode("ascii")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        supplied = self.headers.get("Authorization", "")
        if self.path != "/synthesize" or not TOKEN or not hmac.compare_digest(supplied, f"Bearer {TOKEN}"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("body too large")
            body = json.loads(self.rfile.read(length))
            text = body.get("text")
            reference = base64.b64decode(body.get("referenceAudio", ""), validate=True)
            if not isinstance(text, str) or not 1 <= len(text) <= 600 or not reference or len(reference) > 12 * 1024 * 1024:
                raise ValueError("invalid request")
            result = self.server.worker_manager.synthesize(text, reference)
            payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception:
            self.send_error(502)


def main():
    if not TOKEN:
        raise SystemExit("CHATSCENE_GPU_TOKEN is required")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.worker_manager = WorkerManager()
    try:
        server.serve_forever()
    finally:
        server.worker_manager.close()
        server.server_close()


if __name__ == "__main__":
    main()
