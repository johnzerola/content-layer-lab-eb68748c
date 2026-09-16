from app.audio_worker_main import app
from pathlib import Path


def test_gpu_audio_entrypoint_exposes_only_audio_routes():
    paths = {route.path for route in app.routes}
    assert "/v1/audio/capabilities" in paths
    assert "/v1/health" not in paths


def test_gpu_worker_script_allows_the_published_editor_cors_origin():
    script = (Path(__file__).parents[1] / "scripts" / "run_bandit_gpu_worker.ps1").read_text(encoding="utf-8")
    assert "CORS_ORIGINS" in script
    assert "https://content-layer-lab.lovable.app" in script
