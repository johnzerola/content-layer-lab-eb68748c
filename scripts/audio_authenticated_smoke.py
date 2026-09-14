"""Authenticated end-to-end smoke for the deployed audio worker.

Reads the worker URL and secret from the environment. Tokens are never written
to disk or included in the report.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def token(secret: str, job_id: str, scope: str, ttl: int, legacy: bool) -> str:
    if legacy:
        return hmac.new(secret.encode(), job_id.encode(), hashlib.sha256).hexdigest()
    expires = int(time.time()) + ttl
    payload = f"v2.{job_id}.{expires}.{scope}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def fetch_json(url: str, *, job_token: str | None = None, method: str = "GET", data: bytes | None = None, timeout: int = 30) -> dict:
    headers = {"accept": "application/json"}
    if job_token:
        headers["x-job-token"] = job_token
    if data is not None:
        headers["content-type"] = "audio/wav"
    request = Request(url, method=method, headers=headers, data=data)
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read(4096).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} em {method} {url.rsplit('/', 1)[-1]}: {body}") from error
    except URLError as error:
        raise RuntimeError(f"Worker indisponivel: {error.reason}") from error


def download(url: str, job_token: str, target: Path) -> None:
    request = Request(url, headers={"x-job-token": job_token, "accept": "audio/wav"})
    try:
        with urlopen(request, timeout=60) as response:
            if not response.headers.get_content_type().startswith("audio/"):
                raise RuntimeError("Worker nao retornou audio.")
            target.write_bytes(response.read())
    except HTTPError as error:
        body = error.read(4096).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} ao baixar stem: {body}") from error


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels,duration", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    decode = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], timeout=30)
    if decode.returncode != 0:
        raise RuntimeError(f"Falha ao decodificar {path.name}.")
    return {
        "sha256": digest(path),
        "bytes": path.stat().st_size,
        "codec": stream["codec_name"],
        "sample_rate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "duration": float(stream.get("duration") or data["format"]["duration"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    args = parser.parse_args()

    base = os.environ.get("CLEANER_WORKER_URL", "").strip().rstrip("/")
    public_base = os.environ.get("CLEANER_WORKER_PUBLIC_URL", "").strip().rstrip("/")
    secret = os.environ.get("CLEANER_WORKER_SECRET", "")
    if not base:
        base = public_base
    if not base.startswith("https://") or len(secret) < 32:
        raise RuntimeError("CLEANER_WORKER_URL/SECRET ausentes ou invalidos.")
    if not args.input.is_file():
        raise FileNotFoundError(args.input)

    health = fetch_json(f"{base}/v1/health")
    capabilities = fetch_json(f"{base}/v1/audio/capabilities")
    if capabilities.get("ready") is not True:
        raise RuntimeError("Separador de audio remoto nao esta pronto.")
    legacy = health.get("version") == "1.0.0"
    job_id = str(uuid.uuid4())
    job_base = f"{base}/v1/audio/jobs/{job_id}"
    upload_token = token(secret, job_id, "upload", 600, legacy)
    control_token = token(secret, job_id, "control", args.timeout_seconds + 300, legacy)
    result_token = token(secret, job_id, "result", args.timeout_seconds + 300, legacy)

    args.output_dir.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    uploaded = fetch_json(job_base + "/upload", job_token=upload_token, method="POST", data=args.input.read_bytes(), timeout=60)
    started_state = fetch_json(job_base + "/start", job_token=control_token, method="POST")
    deadline = time.monotonic() + args.timeout_seconds
    observations: list[str] = []
    final_state: dict = {}
    while time.monotonic() < deadline:
        final_state = fetch_json(job_base, job_token=control_token)
        status = str(final_state.get("status", "unknown"))
        if not observations or observations[-1] != status:
            observations.append(status)
        if status in {"completed", "failed", "cancelled"}:
            break
        time.sleep(max(0.1, args.poll_seconds))
    else:
        fetch_json(job_base + "/cancel", job_token=control_token, method="POST")
        raise TimeoutError("Smoke autenticado excedeu o limite e solicitou cancelamento.")
    if final_state.get("status") != "completed":
        raise RuntimeError(f"Job terminou como {final_state.get('status')}: {final_state.get('error')}")

    dialogue = args.output_dir / "dialogue.wav"
    music = args.output_dir / "music.wav"
    download(job_base + "/stems/voice", result_token, dialogue)
    download(job_base + "/stems/music", result_token, music)
    source_probe = probe(args.input)
    dialogue_probe = probe(dialogue)
    music_probe = probe(music)
    for output in (dialogue_probe, music_probe):
        if output["sample_rate"] != 44100 or output["channels"] not in (1, 2):
            raise RuntimeError("Geometria de audio invalida no resultado remoto.")
        if abs(output["duration"] - source_probe["duration"]) > 0.15:
            raise RuntimeError("Duracao do stem diverge da fonte.")

    report = {
        "schema_version": 1,
        "classification": "AUTHENTICATED_REMOTE_SMOKE_PASS",
        "job_id": job_id,
        "authentication": "legacy_hmac" if legacy else "scoped_hmac_v2",
        "tokens_persisted": False,
        "input": {"path": str(args.input), **source_probe},
        "capabilities": {key: capabilities.get(key) for key in ("engine", "model", "device", "quality", "max_duration", "max_bytes")},
        "upload_status": uploaded.get("status"),
        "start_status": started_state.get("status"),
        "observed_statuses": observations,
        "final_state": {key: final_state.get(key) for key in ("status", "duration", "engine", "model", "quality", "processing_seconds", "format", "notice")},
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "outputs": {"dialogue": dialogue_probe, "music": music_probe},
        "quality": "NOT_JUDGED_BY_TECHNICAL_SMOKE",
        "cleanup": "worker_retention_policy",
    }
    (args.output_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
