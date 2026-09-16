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


def test_gpu_worker_autostart_loads_secret_without_putting_it_in_task_arguments():
    scripts = Path(__file__).parents[1] / "scripts"
    launcher = (scripts / "start_bandit_gpu_worker_background.ps1").read_text(encoding="utf-8")
    installer = (scripts / "install_bandit_gpu_autostart.ps1").read_text(encoding="utf-8")

    assert "Read-DotEnvValue" in launcher
    assert "CLEANER_WORKER_SECRET" in launcher
    assert "-WindowStyle Hidden" in installer
    assert "-RestartCount 999" in installer
    assert "CLEANER_WORKER_SECRET" not in installer
