"""No network/GPU calls: verify private image auth and cleanup cost guards."""
import importlib.util
import json
from pathlib import Path
import sys

import pytest


def load_runner():
    path = Path(__file__).parents[1] / "scripts" / "validate_runpod_sample.py"
    spec = importlib.util.spec_from_file_location("sample_validation", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("health_state", ["COMPLETED", "FAILED"])
def test_private_auth_preserved_and_capacity_disabled_after_failed_readiness(tmp_path, monkeypatch, health_state):
    runner = load_runner()
    source = tmp_path / "input.mp4"
    source.write_bytes(b"sample")
    output = tmp_path / "result"
    image = "registry.example/cleaneria@sha256:" + "a" * 64
    monkeypatch.setattr(sys, "argv", ["validate", str(source), str(output), "--image", image])
    monkeypatch.setenv("RUNPOD_API_KEY", "test-key")
    monkeypatch.setenv("RUNPOD_ENDPOINT_ID", runner.ENDPOINT)
    monkeypatch.setenv("CLEANER_WORKER_SECRET", "test-secret-not-a-real-secret")
    monkeypatch.setattr(runner, "probe", lambda _: {"format": {"duration": "5"}})
    monkeypatch.setattr(runner.time, "sleep", lambda _: None)
    calls = []

    class Response:
        ok = True
        status_code = 200

        def __init__(self, data):
            self.data = data

        def json(self):
            return self.data

    class Session:
        headers = {}

        def request(self, method, url, **kwargs):
            calls.append((method, url, kwargs.get("json")))
            if url.endswith("/health"):
                return Response({"jobs": {"inProgress": 0, "inQueue": 0}, "workers": {}})
            if url.endswith("/graphql"):
                return Response({"data": {"myself": {"endpoints": [{"id": runner.ENDPOINT, "template": {
                    "id": "old", "dockerArgs": "{}", "containerDiskInGb": 24,
                    "containerRegistryAuthId": "private-registry", "env": []}}]}}})
            if url.endswith("/templates"):
                assert kwargs["json"]["imageName"] == image
                assert kwargs["json"]["containerRegistryAuthId"] == "private-registry"
                assert kwargs["json"]["isPublic"] is False
                return Response({"id": "new"})
            if url.endswith("/run"):
                assert kwargs["json"]["input"] == {"action": "health"}
                return Response({"id": "health-job"})
            if "/status/" in url:
                return Response({"status": health_state, "output": {"ok": True, "ai_ready": False}})
            return Response({"templateId": "old", "workersMin": 0, "workersMax": 2})

    def cpu(method, url, **kwargs):
        if url.endswith("/detect"):
            return Response({"regions": [{"id": "text", "role": "remove"}]})
        if url.endswith("/plan"):
            return Response({"chunks": [{"index": 0}]})
        return Response({"ok": True})

    monkeypatch.setattr(runner.requests, "Session", Session)
    monkeypatch.setattr(runner.requests, "request", cpu)
    runner.main()
    patches = [data for method, _, data in calls if method == "PATCH"]
    assert patches[-1] == {"workersMin": 0, "workersMax": 0}
    assert len([1 for _, url, _ in calls if url.endswith("/run")]) == 1
    report = json.loads((output / "report.json").read_text())
    assert report["capacity_disabled"] is True
    assert "error" in report
    assert "test-key" not in (output / "report.json").read_text()
    assert not (output / "resultado-5s-REVISAR.mp4").exists()
