from app.audio_worker_main import app


def test_gpu_audio_entrypoint_exposes_only_audio_routes():
    paths = {route.path for route in app.routes}
    assert "/v1/audio/capabilities" in paths
    assert "/v1/health" not in paths
