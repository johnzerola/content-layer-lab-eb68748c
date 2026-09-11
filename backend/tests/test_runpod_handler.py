from app.services.chunking import localize_masks
import importlib.util
from pathlib import Path
from types import SimpleNamespace


def test_localize_masks_filters_and_offsets_timed_regions():
    masks = [
        {"id": "before", "from": 0, "to": 10},
        {"id": "active", "from": 14, "to": 18},
        {"id": "always", "kind": "rect"},
        {"id": "after", "from": 40, "to": 50},
    ]
    result = localize_masks(masks, offset=14.4, duration=16.2)

    assert [item["id"] for item in result] == ["active", "always"]
    assert result[0]["from"] == 0
    assert abs(result[0]["to"] - 3.6) < 1e-9
    assert "from" not in result[1]


def test_handler_records_upload_time_and_removes_its_project(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("handler_test", Path(__file__).resolve().parents[1] / "runpod_handler.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(module, "_gpu_name", lambda: "NVIDIA RTX A5000")
    monkeypatch.setattr(module, "probe", lambda _: SimpleNamespace(duration=1, width=64, height=64, fps=10, frames=10))
    clock = iter([0, 1, 5])
    monkeypatch.setattr(module.time, "monotonic", lambda: next(clock))
    uploaded = []

    def download(_url, destination):
        destination.write_bytes(b"source")
        return destination

    def process(identity, *_args):
        (tmp_path / identity / "output.mp4").write_bytes(b"result")
        return {"metrics": {}}

    monkeypatch.setattr(module, "_download", download)
    monkeypatch.setattr(module, "run_pipeline", process)
    monkeypatch.setattr(module, "_upload", lambda url, path: uploaded.append(path.read_bytes()))
    result = module.handler({"input": {"source_url": "https://source.invalid", "source_is_chunk": True,
        "start": 0, "end": 1, "overlap": 0, "upload_url": "https://storage.invalid/part",
        "expected_revision": "scene-roi-v4"}})
    assert result["ok"] is True
    assert result["seconds"] == 5 and result["processing_seconds"] == 1
    assert result["gpu_name"] == "NVIDIA RTX A5000"
    assert uploaded == [b"result"]
    assert not list(tmp_path.iterdir())
