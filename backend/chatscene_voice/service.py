"""Private ChatScene voice API exposed only through the existing HTTPS proxy.

The service stores authorized references on the VPS, prefers the authenticated
reverse tunnel to the workstation GPU, and falls back to the installed CPU
runtime. It binds to the Docker bridge gateway, never to the public interface.
"""

import base64
import hashlib
import hmac
import io
import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave

try:
    from .catalog import catalog_license_approved, catalog_reference_path, load_catalog
except ImportError:  # standalone systemd entry point
    from catalog import catalog_license_approved, catalog_reference_path, load_catalog


ROOT = Path(os.environ.get("CHATSCENE_VOICE_ROOT", "/opt/chatscene-voice")).resolve()
CONFIG = Path(os.environ.get("CHATSCENE_VOICE_CONFIG", str(ROOT / "runtime.json"))).resolve()
WORKER = Path(os.environ.get("CHATSCENE_VOICE_WORKER", str(ROOT / "worker.py"))).resolve()
SERVICE_SECRET = os.environ.get("CHATSCENE_VOICE_SERVICE_SECRET") or os.environ.get(
    "CLEANER_WORKER_SECRET", ""
)
GPU_RELAY_URL = os.environ.get("CHATSCENE_GPU_RELAY_URL", "http://127.0.0.1:18096").rstrip("/")
GPU_RELAY_TOKEN = os.environ.get("CHATSCENE_GPU_RELAY_TOKEN", "")
BIND = os.environ.get("CHATSCENE_VOICE_SERVICE_BIND", "127.0.0.1")
PORT = int(os.environ.get("CHATSCENE_VOICE_SERVICE_PORT", "18097"))
PIPER_MODEL = Path(
    os.environ.get("PIPER_MODEL_PATH", str(ROOT / "piper" / "pt_BR-faber-medium.onnx"))
).resolve()
PIPER_CONFIG = Path(
    os.environ.get("PIPER_CONFIG_PATH", f"{PIPER_MODEL}.json")
).resolve()
PIPER_VOICES = {
    "pt_BR-faber-medium": (PIPER_MODEL, PIPER_CONFIG),
    "pt_BR-cadu-medium": (
        ROOT / "piper" / "pt_BR-cadu-medium.onnx",
        ROOT / "piper" / "pt_BR-cadu-medium.onnx.json",
    ),
    "pt_BR-jeff-medium": (
        ROOT / "piper" / "pt_BR-jeff-medium.onnx",
        ROOT / "piper" / "pt_BR-jeff-medium.onnx.json",
    ),
}
MAX_BODY = 16 * 1024 * 1024
MAX_AUDIO = 12 * 1024 * 1024
IDLE_SECONDS = int(os.environ.get("CHATSCENE_VOICE_IDLE_SECONDS", "120"))
MODEL_FILES = (
    "ve.pt",
    "s3gen.pt",
    "t3_mtl23ls_v2.safetensors",
    "grapheme_mtl_merged_expanded_v1.json",
)


def runtime_config():
    value = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    value.update(
        {
            "pythonPath": os.environ.get("CHATSCENE_VOICE_PYTHON_PATH", value.get("pythonPath")),
            "modelPath": os.environ.get("CHATSCENE_VOICE_MODEL_PATH", value.get("modelPath")),
            "storagePath": os.environ.get("CHATSCENE_VOICE_STORAGE_PATH", value.get("storagePath")),
            "device": os.environ.get("CHATSCENE_VOICE_DEVICE", value.get("device", "cpu")),
        }
    )
    return value


def engine_installed():
    try:
        config = runtime_config()
        model = Path(config["modelPath"])
        return bool(config.get("ready")) and all((model / name).is_file() for name in MODEL_FILES)
    except (OSError, KeyError, ValueError, TypeError):
        return False


def piper_installed(voice="pt_BR-faber-medium"):
    paths = PIPER_VOICES.get(voice)
    return bool(paths and paths[0].is_file() and paths[1].is_file())


def synthesize_piper(text, speed=1.0, voice="pt_BR-faber-medium"):
    if voice not in PIPER_VOICES:
        raise ValueError("Esta voz local não está no catálogo autorizado.")
    if not piper_installed(voice):
        raise ValueError(f"A voz {voice} ainda não está instalada neste servidor.")
    model_path, config_path = PIPER_VOICES[voice]
    safe_speed = max(0.7, min(1.3, float(speed)))
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "piper",
            "-m",
            str(model_path),
            "-c",
            str(config_path),
            "--output-raw",
            "--length-scale",
            str(1 / safe_speed),
        ],
        input=(text.strip() + "\n").encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=60,
        check=False,
    )
    if process.returncode or not process.stdout:
        raise RuntimeError("A voz padrão PT-BR não produziu áudio.")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        sample_rate = int(config.get("audio", {}).get("sample_rate", 22050))
    except (OSError, ValueError, TypeError):
        sample_rate = 22050
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(process.stdout)
    return output.getvalue()


def transform_speech(audio, config):
    """One FFmpeg render for pitch and tempo; pitch alone keeps duration."""
    if not audio or len(audio) > MAX_AUDIO:
        raise ValueError("O áudio de origem excede o limite permitido.")
    mode = config.get("mode")
    if mode not in {"VARISPEED", "TEMPO_ONLY", "PITCH_ONLY", "SPEED_AND_PITCH", "VARISPEED_THEN_RESTORE_TEMPO"}:
        raise ValueError("Modo de transformação inválido.")
    speed = float(config.get("speedMultiplier", 1))
    pitch = float(config.get("pitchSemitones", 0))
    if not math.isfinite(speed) or not 0.25 <= speed <= 4 or not math.isfinite(pitch) or not -12 <= pitch <= 12:
        raise ValueError("Ajuste de velocidade ou tom fora do limite.")
    if config.get("linkedPitchToSpeed"):
        pitch += 12 * math.log2(speed)
    ratio = 2 ** (pitch / 12)
    filters = ["aresample=24000"]
    if mode != "TEMPO_ONLY":
        filters.extend([f"asetrate={round(24000 * ratio)}", "aresample=24000"])
    tempo = {
        "VARISPEED": 1,
        "TEMPO_ONLY": speed,
        "PITCH_ONLY": 1 / ratio,
        "SPEED_AND_PITCH": speed / ratio,
        "VARISPEED_THEN_RESTORE_TEMPO": 1 / ratio,
    }[mode]
    while tempo > 2:
        filters.append("atempo=2")
        tempo /= 2
    while tempo < 0.5:
        filters.append("atempo=0.5")
        tempo /= 0.5
    if abs(tempo - 1) > 0.000001:
        filters.append(f"atempo={tempo:.8f}")
    effect = config.get("effect", "none")
    effect_filters = {
        "none": [],
        "radio": ["highpass=f=220", "lowpass=f=3800", "acompressor=threshold=-18dB:ratio=4:attack=5:release=80"],
        "telephone": ["highpass=f=450", "lowpass=f=3200", "acompressor=threshold=-20dB:ratio=6:attack=3:release=60"],
        "megaphone": ["highpass=f=500", "lowpass=f=5200", "acompressor=threshold=-16dB:ratio=5:attack=3:release=80", "volume=1.35"],
        "robot": ["aecho=0.8:0.88:40:0.4"],
        "cave": ["aecho=0.8:0.9:90:0.35"],
        "horror": ["highpass=f=70", "lowpass=f=8500", "aecho=0.8:0.88:70:0.4"],
    }
    if effect not in effect_filters:
        raise ValueError("Efeito de voz inválido.")
    filters.extend(effect_filters[effect])
    if config.get("normalization", {}).get("enabled", True):
        filters.append("loudnorm=I=-18:TP=-1.5:LRA=11")
    process = subprocess.run(
        [os.environ.get("FFMPEG_PATH", "ffmpeg"), "-hide_banner", "-loglevel", "error",
         "-i", "pipe:0", "-vn", "-af", ",".join(filters), "-ac", "1", "-ar", "24000",
         "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", "pipe:1"],
        input=audio, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        timeout=60, check=False,
    )
    if process.returncode or not process.stdout or len(process.stdout) > MAX_AUDIO:
        raise RuntimeError("Não foi possível ajustar o tom desta voz.")
    return process.stdout


def account_directory(user_id):
    uuid.UUID(user_id)
    storage = Path(runtime_config()["storagePath"]).resolve()
    directory = storage / hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    return directory


def reference_path(user_id, reference_id):
    uuid.UUID(reference_id)
    return account_directory(user_id) / f"{reference_id}.wav"


def decode_reference(audio):
    if not audio or len(audio) > MAX_AUDIO:
        raise ValueError("Envie um áudio de até 12 MB.")
    process = subprocess.run(
        [
            os.environ.get("FFMPEG_PATH", "ffmpeg"),
            "-hide_banner",
            "-loglevel",
            "error",
            "-protocol_whitelist",
            "pipe",
            "-i",
            "pipe:0",
            "-t",
            "30.1",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-f",
            "s16le",
            "pipe:1",
        ],
        input=audio,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=25,
        check=False,
    )
    pcm = process.stdout
    if process.returncode or not pcm:
        raise ValueError("Formato de áudio inválido. Envie WAV, MP3, M4A ou OGG.")
    duration = len(pcm) / 48000
    if duration < 3 or duration > 30:
        raise ValueError("Use uma amostra com 3 a 30 segundos de fala limpa.")
    sample_count = len(pcm) // 2
    power = 0.0
    for offset in range(0, len(pcm) - 1, 2):
        sample = int.from_bytes(pcm[offset : offset + 2], "little", signed=True) / 32768
        power += sample * sample
    if sample_count == 0 or math.sqrt(power / sample_count) < 0.001:
        raise ValueError("O áudio está silencioso. Envie uma amostra com fala audível.")
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(24000)
        target.writeframes(pcm)
    return output.getvalue(), duration


def relay_health():
    try:
        with urllib.request.urlopen(f"{GPU_RELAY_URL}/health", timeout=2) as response:
            if response.status != 200:
                return None
            return json.loads(response.read())
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        return None


def gpu_warm():
    if not GPU_RELAY_TOKEN:
        raise RuntimeError("GPU relay unavailable")
    request = urllib.request.Request(
        f"{GPU_RELAY_URL}/warm",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {GPU_RELAY_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        if response.status != 200:
            raise RuntimeError("GPU relay warmup failed")


def gpu_synthesize(text, reference):
    if not GPU_RELAY_TOKEN:
        raise RuntimeError("GPU relay unavailable")
    relay = gpu_health()
    if not relay or not relay.get("installed"):
        raise RuntimeError("GPU relay is not ready")
    request = urllib.request.Request(
        f"{GPU_RELAY_URL}/synthesize",
        data=json.dumps(
            {"text": text, "referenceAudio": base64.b64encode(reference).decode("ascii")},
            ensure_ascii=False,
        ).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GPU_RELAY_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.loads(response.read())
    audio = result.get("audio")
    if not audio:
        raise RuntimeError("GPU relay returned no audio")
    return base64.b64decode(audio, validate=True), "cuda"


class CpuWorker:
    def __init__(self):
        self.process = subprocess.Popen(
            [sys.executable, "-u", str(WORKER), str(CONFIG)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        ready_line = self.process.stdout.readline()
        ready = json.loads(ready_line) if ready_line else {}
        if not ready.get("ready"):
            self.close()
            raise RuntimeError("CPU voice worker did not become ready")

    def synthesize(self, text, path):
        if self.process.poll() is not None:
            raise RuntimeError("CPU voice worker exited")
        request_id = str(uuid.uuid4())
        self.process.stdin.write(
            json.dumps(
                {"id": request_id, "text": text, "referencePath": str(path)},
                ensure_ascii=False,
            )
            + "\n"
        )
        self.process.stdin.flush()
        result = json.loads(self.process.stdout.readline())
        if result.get("id") != request_id or result.get("error") or not result.get("audio"):
            raise RuntimeError("CPU voice synthesis failed")
        return base64.b64decode(result["audio"], validate=True)

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()


class CpuWorkerManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.worker = None
        self.timer = None

    @property
    def loaded(self):
        return self.worker is not None and self.worker.process.poll() is None

    def _cancel_idle_locked(self):
        if self.timer:
            self.timer.cancel()
            self.timer = None

    def _schedule_idle_locked(self):
        if self.loaded:
            self.timer = threading.Timer(IDLE_SECONDS, self.close)
            self.timer.daemon = True
            self.timer.start()

    def warm(self):
        with self.lock:
            self._cancel_idle_locked()
            if not self.loaded:
                self.worker = CpuWorker()
            self._schedule_idle_locked()

    def synthesize(self, text, path):
        with self.lock:
            self._cancel_idle_locked()
            if not self.loaded:
                self.worker = CpuWorker()
            try:
                return self.worker.synthesize(text, path)
            except Exception:
                self.close_locked()
                raise
            finally:
                self._schedule_idle_locked()

    def close_locked(self):
        if self.timer:
            self.timer.cancel()
            self.timer = None
        if self.worker:
            self.worker.close()
            self.worker = None

    def close(self):
        with self.lock:
            self.close_locked()


CPU = CpuWorkerManager()
INFERENCE_SLOTS = threading.BoundedSemaphore(8)
WARMING = threading.Event()
WARMING_LOCK = threading.Lock()


def warm_engine():
    try:
        try:
            gpu_warm()
        except Exception:
            CPU.warm()
    finally:
        WARMING.clear()


def request_warm():
    with WARMING_LOCK:
        if WARMING.is_set():
            return False
        status = relay_health()
        if (status and status.get("modelLoaded")) or CPU.loaded:
            return False
        WARMING.set()
        thread = threading.Thread(target=warm_engine, name="voice-warmup", daemon=True)
        thread.start()
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "ChatSceneVoice/1"

    def log_message(self, *_args):
        return

    def authorized(self):
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {SERVICE_SECRET}"
        return bool(SERVICE_SECRET) and hmac.compare_digest(supplied, expected)

    def respond(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            raise ValueError("invalid request size")
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        if self.path != "/v1/voice/health" or not self.authorized():
            self.respond(404, {"detail": "not found"})
            return
        relay = relay_health()
        gpu_loaded = bool(relay and relay.get("modelLoaded"))
        self.respond(
            200,
            {
                "installed": engine_installed(),
                "genericInstalled": piper_installed(),
                "piperVoices": [name for name in PIPER_VOICES if piper_installed(name)],
                "catalogLicenseApproved": catalog_license_approved(),
                "catalogVoices": load_catalog(ROOT),
                "pitchTransform": True,
                "device": "remote-cuda" if relay and not CPU.loaded else "cpu",
                "modelLoaded": gpu_loaded or CPU.loaded,
                "warming": WARMING.is_set(),
            },
        )

    def do_POST(self):
        if not self.authorized():
            self.respond(404, {"detail": "not found"})
            return
        try:
            body = self.body()
            if self.path == "/v1/voice/warm":
                self.respond(202, {"warming": request_warm() or WARMING.is_set()})
                return
            if self.path == "/v1/voice/references":
                user_id = str(body.get("userId", ""))
                audio = base64.b64decode(body.get("audio", ""), validate=True)
                wav, duration = decode_reference(audio)
                reference_id = str(uuid.uuid4())
                directory = account_directory(user_id)
                path = directory / f"{reference_id}.wav"
                path.write_bytes(wav)
                os.chmod(path, 0o600)
                metadata = directory / f"{reference_id}.json"
                metadata.write_text(
                    json.dumps(
                        {
                            "authorized": True,
                            "authorizationVersion": "adult-own-or-written-1",
                            "createdAt": int(time.time()),
                            "durationSec": duration,
                        }
                    ),
                    encoding="utf-8",
                )
                os.chmod(metadata, 0o600)
                request_warm()
                self.respond(201, {"id": reference_id, "durationSec": duration})
                return
            if self.path == "/v1/voice/generic":
                text = body.get("text")
                if not isinstance(text, str) or not 1 <= len(text) <= 600:
                    raise ValueError("Texto deve ter entre 1 e 600 caracteres.")
                if not INFERENCE_SLOTS.acquire(blocking=False):
                    self.respond(
                        429,
                        {"detail": "A fila de vozes está cheia. Tente novamente em instantes."},
                    )
                    return
                try:
                    audio = synthesize_piper(text, body.get("speed", 1), body.get("voice", "pt_BR-faber-medium"))
                finally:
                    INFERENCE_SLOTS.release()
                self.respond(
                    200,
                    {"audio": base64.b64encode(audio).decode("ascii"), "device": "cpu"},
                )
                return
            if self.path == "/v1/voice/catalog/synthesize":
                text = body.get("text")
                voice = str(body.get("voice", ""))
                if not isinstance(text, str) or not 1 <= len(text) <= 600:
                    raise ValueError("Texto deve ter entre 1 e 600 caracteres.")
                path = catalog_reference_path(ROOT, voice)
                if not INFERENCE_SLOTS.acquire(blocking=False):
                    self.respond(429, {"detail": "A fila de vozes está cheia. Tente novamente."})
                    return
                try:
                    reference = path.read_bytes()
                    try:
                        audio, device = gpu_synthesize(text, reference)
                    except Exception:
                        audio, device = CPU.synthesize(text, path), "cpu"
                finally:
                    INFERENCE_SLOTS.release()
                self.respond(
                    200,
                    {"audio": base64.b64encode(audio).decode("ascii"), "device": device},
                )
                return
            if self.path == "/v1/voice/transform":
                raw_audio = base64.b64decode(body.get("audio", ""), validate=True)
                config = body.get("config")
                if not isinstance(config, dict):
                    raise ValueError("Configuração de tom inválida.")
                if not INFERENCE_SLOTS.acquire(blocking=False):
                    self.respond(429, {"detail": "A fila de vozes está cheia. Tente novamente."})
                    return
                try:
                    audio = transform_speech(raw_audio, config)
                finally:
                    INFERENCE_SLOTS.release()
                self.respond(200, {"audio": base64.b64encode(audio).decode("ascii"), "mime": "audio/mpeg"})
                return
            if self.path == "/v1/voice/synthesize":
                user_id = str(body.get("userId", ""))
                reference_id = str(body.get("referenceId", ""))
                text = body.get("text")
                if not isinstance(text, str) or not 1 <= len(text) <= 600:
                    raise ValueError("Texto deve ter entre 1 e 600 caracteres.")
                path = reference_path(user_id, reference_id)
                if not path.is_file():
                    self.respond(404, {"detail": "Referência de voz indisponível para esta conta."})
                    return
                if not INFERENCE_SLOTS.acquire(blocking=False):
                    self.respond(
                        429,
                        {"detail": "A fila de vozes está cheia. Tente novamente em instantes."},
                    )
                    return
                try:
                    reference = path.read_bytes()
                    try:
                        audio, device = gpu_synthesize(text, reference)
                    except Exception:
                        audio, device = CPU.synthesize(text, path), "cpu"
                finally:
                    INFERENCE_SLOTS.release()
                self.respond(
                    200,
                    {"audio": base64.b64encode(audio).decode("ascii"), "device": device},
                )
                return
            self.respond(404, {"detail": "not found"})
        except (ValueError, TypeError, KeyError, subprocess.TimeoutExpired) as error:
            self.respond(400, {"detail": str(error) or "Requisição de voz inválida."})
        except Exception:
            self.respond(502, {"detail": "O motor de voz não conseguiu concluir esta operação."})

    def do_DELETE(self):
        if self.path != "/v1/voice/references" or not self.authorized():
            self.respond(404, {"detail": "not found"})
            return
        try:
            body = self.body()
            user_id = str(body.get("userId", ""))
            reference_id = str(body.get("referenceId", ""))
            path = reference_path(user_id, reference_id)
            path.unlink(missing_ok=True)
            path.with_suffix(".json").unlink(missing_ok=True)
            self.respond(200, {"removed": True})
        except (ValueError, TypeError, KeyError):
            self.respond(400, {"detail": "Referência de voz inválida."})


def main():
    if len(SERVICE_SECRET) < 32:
        raise SystemExit("CHATSCENE_VOICE_SERVICE_SECRET or CLEANER_WORKER_SECRET is required")
    if not engine_installed():
        raise SystemExit("ChatScene voice runtime is incomplete")
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        CPU.close()
        server.server_close()


if __name__ == "__main__":
    main()
