import os
from pathlib import Path
import uuid
from unittest.mock import patch

import pytest

from app.audio_separation import capabilities
from app.storage import read_state
from backend.tests.test_audio_separation import service, header, wav


def test_bandit_missing_configuration_is_not_ready(monkeypatch):
    monkeypatch.setenv("AUDIO_SEPARATION_ENGINE", "bandit")
    monkeypatch.setenv("AUDIO_SEPARATION_ENABLED", "1")
    monkeypatch.setenv("BANDIT_CHECKPOINT", "missing-checkpoint")
    assert not capabilities()["ready"]


def test_bandit_persists_engine_and_downloads_after_configuration_change(service, monkeypatch):
    manager, client = service
    monkeypatch.setenv("AUDIO_SEPARATION_ENGINE", "bandit")
    job = str(uuid.uuid4())
    with patch("app.audio_separation.capabilities", return_value={"ready": True, "notice": "Bandit attribution"}):
        assert client.post(f"/v1/audio/jobs/{job}/upload", content=wav(), headers=header(manager, job, "upload")).status_code == 200
        def separate(directory, event):
            target = directory / "separated/v2-multi/input"
            target.mkdir(parents=True)
            for name in ("vocals", "no_vocals"):
                (target / f"{name}.wav").write_bytes(wav())
            return 0.1
        with patch("app.audio_separation.separate", side_effect=separate):
            client.post(f"/v1/audio/jobs/{job}/start", headers=header(manager, job, "control"))
    assert read_state(manager.root / job)["engine"] == "bandit"
    monkeypatch.setenv("AUDIO_SEPARATION_ENGINE", "demucs")
    for stem in ("voice", "music"):
        assert client.get(f"/v1/audio/jobs/{job}/stems/{stem}", headers=header(manager, job, "result")).content == wav()


@pytest.mark.skipif(not os.getenv("BANDIT_SMOKE_INPUT"), reason="Needs local pinned weights and real audio")
def test_real_bandit_authenticated_flow(service, monkeypatch):
    manager, client = service
    monkeypatch.setenv("AUDIO_SEPARATION_ENGINE", "bandit")
    monkeypatch.setenv("AUDIO_SEPARATION_ENABLED", "1")
    assert capabilities()["ready"]
    job = str(uuid.uuid4())
    result = client.post(f"/v1/audio/jobs/{job}/upload", content=Path(os.environ["BANDIT_SMOKE_INPUT"]).read_bytes(),
                        headers=header(manager, job, "upload"))
    assert result.status_code == 200
    client.post(f"/v1/audio/jobs/{job}/start", headers=header(manager, job, "control"))
    state = client.get(f"/v1/audio/jobs/{job}", headers=header(manager, job, "control")).json()
    assert state["status"] == "completed", state
    assert state["engine"] == "bandit"
    for stem in ("voice", "music"):
        response = client.get(f"/v1/audio/jobs/{job}/stems/{stem}", headers=header(manager, job, "result"))
        assert response.status_code == 200 and len(response.content) > 1000
