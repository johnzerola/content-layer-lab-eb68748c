import json
import os
import time
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

from app.storage import (JobStillActive, cleanup_expired, cleanup_intermediates,
                         job_dir, read_state, recover_stale_processing, write_state)


def make_job(tmp_path, status="completed"):
    identity = str(uuid.uuid4())
    directory = job_dir(tmp_path, identity)
    directory.mkdir()
    write_state(directory, {"status": status})
    for filename in ("input.mp4", "output.mp4", "preview.mp4", "composited.mp4"):
        (directory / filename).write_bytes(b"media")
    (directory / "scenes" / "0000").mkdir(parents=True)
    (directory / "scenes" / "0000" / "input.mp4").write_bytes(b"temporary")
    return identity, directory


@pytest.mark.parametrize("status", ["completed", "failed", "cancelled"])
def test_cleanup_preserves_original_result_state_and_other_jobs(tmp_path, status):
    identity, directory = make_job(tmp_path, status)
    _, other = make_job(tmp_path)
    report = cleanup_intermediates(tmp_path, identity)
    assert report["removed_files"] == 2
    assert not report["failed_paths"]
    for name in ("input.mp4", "output.mp4", "preview.mp4", "state.json"):
        assert (directory / name).exists()
    assert (other / "scenes").exists()
    assert cleanup_intermediates(tmp_path, identity)["removed_files"] == 0


@pytest.mark.parametrize("status", ["processing", "assembling", "encoding", "unknown-future-stage"])
def test_active_or_unknown_stages_never_deleted(tmp_path, status):
    identity, directory = make_job(tmp_path, status)
    with pytest.raises(JobStillActive):
        cleanup_intermediates(tmp_path, identity)
    state = {"status": status, "updated_at": time.time() - 10_000}
    (directory / "state.json").write_text(json.dumps(state))
    assert cleanup_expired(tmp_path, 60) == 0
    assert (directory / "input.mp4").exists()


def test_cancel_request_is_not_proof_the_process_stopped(tmp_path):
    identity, directory = make_job(tmp_path, "cancelled")
    (directory / ".processing").write_text(json.dumps({"pid": os.getpid(), "started_at": time.time()}))
    with pytest.raises(JobStillActive):
        cleanup_intermediates(tmp_path, identity)
    assert recover_stale_processing(tmp_path) == 0
    assert (directory / "scenes").exists()


def test_dead_owner_is_recovered_and_active_owner_is_kept(tmp_path):
    identity, directory = make_job(tmp_path, "processing")
    (directory / ".processing").write_text(json.dumps({"pid": 1234, "started_at": time.time()}))
    with patch("app.storage._process_identity", return_value=(None, None)):
        assert recover_stale_processing(tmp_path) == 0
    with patch("app.storage._process_identity", return_value=(False, None)):
        assert recover_stale_processing(tmp_path) == 1
    assert read_state(directory)["status"] == "failed"
    assert not (directory / ".processing").exists()
    assert (directory / "input.mp4").exists()
    assert not (directory / "scenes").exists()


def test_retention_removes_only_expired_completed_job(tmp_path):
    _, expired = make_job(tmp_path)
    _, current = make_job(tmp_path)
    (expired / "state.json").write_text(json.dumps({"status": "completed", "updated_at": time.time() - 10_000}))
    assert cleanup_expired(tmp_path, 60) == 1
    assert not expired.exists()
    assert current.exists()


def test_cleanup_does_not_follow_links_outside_owned_job(tmp_path):
    identity, directory = make_job(tmp_path)
    outside = tmp_path / "important-original.mp4"
    outside.write_bytes(b"keep")
    link = directory / "scenes" / "outside.mp4"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("symlinks unavailable")
    report = cleanup_intermediates(tmp_path, identity)
    assert outside.read_bytes() == b"keep"
    assert report["skipped_links"] == 1


def test_noncanonical_job_ids_cannot_escape_storage(tmp_path):
    for identity in ("../elsewhere", "", str(uuid.uuid4()) + "/../"):
        with pytest.raises(ValueError):
            cleanup_intermediates(tmp_path, identity)
