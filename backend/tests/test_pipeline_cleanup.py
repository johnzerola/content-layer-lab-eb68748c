import json
import os
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.storage import read_state, write_state
from app.workers import tasks


@pytest.mark.parametrize("fail", [False, True])
def test_terminal_pipeline_removes_temporary_files_after_releasing_marker(tmp_path, fail):
    identity = str(uuid.uuid4())
    directory = tmp_path / identity
    directory.mkdir()
    (directory / "input.mp4").write_bytes(b"original")
    info = SimpleNamespace(width=64, height=64, fps=10, frames=10, duration=1, has_audio=False)

    def filter_video(_source, destination, *_args, **_kwargs):
        owner = json.loads((directory / ".processing").read_text())
        assert owner["pid"] == os.getpid()
        (directory / "masks").mkdir()
        (directory / "masks" / "000000.png").write_bytes(b"temporary")
        if fail:
            raise RuntimeError("encoder failed")
        (directory / "output.mp4").write_bytes(b"result")
        return destination

    with patch.object(tasks, "SETTINGS", SimpleNamespace(storage_dir=tmp_path)), \
         patch.object(tasks, "probe", return_value=info), \
         patch.object(tasks, "ffmpeg_filter", side_effect=filter_video), \
         patch.object(tasks, "empty_cache"), patch.object(tasks, "device_name", return_value="cpu"):
        if fail:
            with pytest.raises(RuntimeError, match="encoder failed"):
                tasks.run_pipeline(identity, "subtitle", "fast", [], options={"strategy": "crop-clean", "enhance": False})
        else:
            tasks.run_pipeline(identity, "subtitle", "fast", [], options={"strategy": "crop-clean", "enhance": False})
    assert not (directory / ".processing").exists()
    assert not (directory / "masks").exists()
    assert (directory / "input.mp4").read_bytes() == b"original"
    assert read_state(directory)["cleanup_pending"] is False
    if not fail:
        assert (directory / "output.mp4").read_bytes() == b"result"


def test_cancelled_before_execution_does_not_start_model_or_erase_cancel(tmp_path):
    identity = str(uuid.uuid4())
    directory = tmp_path / identity
    write_state(directory, {"status": "cancelled"})
    (directory / ".cancel").touch()
    with patch.object(tasks, "SETTINGS", SimpleNamespace(storage_dir=tmp_path)), \
         patch.object(tasks, "probe") as probe, patch.object(tasks, "empty_cache"):
        result = tasks.run_pipeline(identity, "subtitle", "quality", [])
    assert result["status"] == "cancelled"
    probe.assert_not_called()
    assert (directory / ".cancel").exists()
    assert not (directory / ".processing").exists()
