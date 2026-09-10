import io
import threading
import uuid
import wave
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.audio_separation import AudioSeparation, audio_info, capabilities, command, mix_command
from app.security import create_job_token
from app.storage import read_state, write_state, cleanup_expired


@pytest.fixture
def service(tmp_path):
    settings = SimpleNamespace(storage_dir=tmp_path, worker_secret="test-secret" * 5,
                               retention_seconds=3600, min_free_bytes=0, storage_quota_bytes=2**32)
    manager = AudioSeparation(settings)
    app = FastAPI()
    app.include_router(manager.router)
    return manager, TestClient(app)


def header(manager, job_id, scope):
    return {"x-job-token": create_job_token(manager.settings.worker_secret, job_id, scope, 3600)}


def wav(seconds=0.1, rate=44100):
    result = io.BytesIO()
    with wave.open(result, "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b"\x00" * int(seconds * rate) * 4)
    return result.getvalue()


def test_fixed_command_is_audio_only_cpu(tmp_path):
    args = command(tmp_path / "input.wav", tmp_path / "out")
    assert args[args.index("--device") + 1] == "cpu"
    assert args[args.index("--two-stems") + 1] == "vocals"
    assert args[args.index("-n") + 1] == "htdemucs"
    assert args[args.index("--shifts") + 1] == "0"
    assert "--float32" in args
    assert "--mp3" not in args
    assert "runpod" not in " ".join(args)

def test_quality_command_uses_lossless_finetuned_model(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIO_SEPARATION_QUALITY", "quality")
    args = command(tmp_path / "input.wav", tmp_path / "out")
    assert args[args.index("-n") + 1] == "htdemucs_ft"
    assert args[args.index("--shifts") + 1] == "1"
    assert args[args.index("--overlap") + 1] == "0.5"
    assert "--float32" in args


def test_unknown_quality_falls_back_to_fast_profile(monkeypatch, tmp_path):
    monkeypatch.setenv("AUDIO_SEPARATION_QUALITY", "ensemble")
    args = command(tmp_path / "input.wav", tmp_path / "out")
    assert args[args.index("-n") + 1] == "htdemucs"
    assert capabilities()["quality"] == "fast"
    assert set(capabilities()["profiles"]) == {"fast", "quality"}


def test_ensemble_mix_is_shell_free(tmp_path):
    args = mix_command(tmp_path / "a.wav", tmp_path / "b.wav", tmp_path / "out.wav")
    assert args[0] == "ffmpeg"
    assert "|" not in " ".join(args)
    assert "amix=inputs=2" in args[args.index("-filter_complex") + 1]


def test_capabilities_expose_hostear_cpu_limits(monkeypatch):
    monkeypatch.setenv("AUDIO_SEPARATION_THREADS", "4")
    monkeypatch.setenv("AUDIO_SEPARATION_TIMEOUT_SECONDS", "1200")
    info = capabilities()
    assert info["threads"] == 4
    assert info["timeout_seconds"] == 1200


def test_missing_and_wrong_scope_tokens_are_denied(service):
    manager, client = service
    job_id = str(uuid.uuid4())
    url = f"/v1/audio/jobs/{job_id}"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=header(manager, job_id, "result")).status_code == 401
    assert client.get(url, headers=header(manager, str(uuid.uuid4()), "control")).status_code == 401


def test_unavailable_does_not_accept_upload(service):
    manager, client = service
    job_id = str(uuid.uuid4())
    with patch("app.audio_separation.capabilities", return_value={"ready": False}):
        result = client.post(f"/v1/audio/jobs/{job_id}/upload", content=wav(), headers=header(manager, job_id, "upload"))
    assert result.status_code == 503
    assert not (manager.root / job_id).exists()


def test_real_wav_upload_duplicate_and_invalid_media(service):
    manager, client = service
    job_id = str(uuid.uuid4())
    with patch("app.audio_separation.capabilities", return_value={"ready": True}):
        url = f"/v1/audio/jobs/{job_id}/upload"
        assert client.post(url, content=wav(), headers=header(manager, job_id, "upload")).status_code == 200
        assert client.post(url, content=b"bad", headers=header(manager, job_id, "upload")).status_code == 409
        assert audio_info(manager.root / job_id / "input.wav") == pytest.approx(0.1)
        other = str(uuid.uuid4())
        assert client.post(f"/v1/audio/jobs/{other}/upload", content=b"not audio", headers=header(manager, other, "upload")).status_code == 422
        assert not (manager.root / other / "input.wav").exists()


def test_run_error_releases_slot_and_never_completes(service):
    manager, client = service
    job_id = str(uuid.uuid4())
    directory = manager.root / job_id
    write_state(directory, {"status": "uploaded"})
    with patch("app.audio_separation.capabilities", return_value={"ready": True}), \
         patch("app.audio_separation.separate", side_effect=RuntimeError("Model unavailable")):
        assert client.post(f"/v1/audio/jobs/{job_id}/start", headers=header(manager, job_id, "control")).status_code == 200
    assert read_state(directory)["status"] == "failed"
    assert not manager.slot.locked()
    assert not manager.active
    assert client.get(f"/v1/audio/jobs/{job_id}/stems/voice", headers=header(manager, job_id, "result")).status_code == 409


def test_busy_and_cancel(service):
    manager, client = service
    job_id = str(uuid.uuid4())
    event = threading.Event()
    manager.active[job_id] = event
    manager.slot.acquire()
    try:
        with patch("app.audio_separation.capabilities", return_value={"ready": True}):
            assert client.post(f"/v1/audio/jobs/{job_id}/start", headers=header(manager, job_id, "control")).status_code == 429
        assert client.post(f"/v1/audio/jobs/{job_id}/cancel", headers=header(manager, job_id, "control")).status_code == 200
        assert event.is_set()
    finally:
        manager.slot.release()


def test_parent_cleanup_keeps_audio_namespace(service):
    manager, _ = service
    directory = manager.root / str(uuid.uuid4())
    write_state(directory, {"status": "processing"})
    cleanup_expired(manager.settings.storage_dir, 1, ("audio-stems",))
    assert directory.exists()
    manager.recover()
    assert read_state(directory)["status"] == "failed"


def test_bad_rate_rejected(tmp_path):
    source = tmp_path / "input.wav"
    source.write_bytes(wav(rate=22050))
    with pytest.raises(ValueError, match="44.100"):
        audio_info(source)
