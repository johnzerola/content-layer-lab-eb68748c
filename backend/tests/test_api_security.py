from __future__ import annotations

import os
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


TEMPORARY = tempfile.TemporaryDirectory()
os.environ["CLEANER_STORAGE"] = TEMPORARY.name
os.environ["CLEANER_WORKER_SECRET"] = "s" * 48
os.environ["CLEANER_ALLOWED_HOSTS"] = "testserver,localhost,127.0.0.1"
os.environ["CLEANER_MAX_UPLOAD_GB"] = "0.05"

from app.main import ACTIVE_JOBS, SETTINGS, app  # noqa: E402
from app.security import create_job_token, create_service_token  # noqa: E402


JOB_ID = "00000000-0000-4000-8000-000000000002"


class ApiSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        TEMPORARY.cleanup()

    def token(self, scope: str) -> str:
        return create_job_token(SETTINGS.worker_secret, JOB_ID, scope, 300)

    def service_token(self) -> str:
        return create_service_token(SETTINGS.worker_secret, "media", 300)

    def setUp(self):
        ACTIVE_JOBS.discard(JOB_ID)
        shutil.rmtree(Path(TEMPORARY.name) / JOB_ID, ignore_errors=True)

    @patch("app.main.resolve_public_media")
    def test_media_resolver_requires_service_token(self, resolver):
        resolver.return_value = {
            "url": "https://cdn.example.com/video.mp4",
            "headers": {},
            "title": "video",
            "source": "test",
            "ext": "mp4",
        }
        missing = self.client.post(
            "/v1/media/resolve", json={"url": "https://www.tiktok.com/@owner/video/123"}
        )
        valid = self.client.post(
            "/v1/media/resolve",
            headers={"x-service-token": self.service_token()},
            json={"url": "https://www.tiktok.com/@owner/video/123"},
        )
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(valid.status_code, 200)

    def test_upload_rejects_wrong_scope(self):
        response = self.client.post(
            f"/v1/jobs/{JOB_ID}/upload",
            headers={"x-job-token": self.token("control"), "x-file-size": "4"},
            files={"file": ("video.mp4", b"test", "video/mp4")},
        )
        self.assertEqual(response.status_code, 401)

    @patch("app.main.slice_video")
    def test_chunk_source_caches_only_the_planned_window(self, slice_video):
        directory = Path(TEMPORARY.name) / JOB_ID
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "input.mp4").write_bytes(b"master")
        (directory / "gpu-plan.json").write_text(
            json.dumps({
                "chunks": [{
                    "index": 2,
                    "read_start": 29.4,
                    "read_duration": 16.2,
                }],
            }),
            encoding="utf-8",
        )

        def create_chunk(_source, destination, _start, _duration):
            Path(destination).write_bytes(b"x" * 2048)
            return destination

        slice_video.side_effect = create_chunk
        url = f"/v1/jobs/{JOB_ID}/chunks/2/source?token={self.token('result')}"
        first = self.client.get(url)
        second = self.client.get(url)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(slice_video.call_count, 1)
        self.assertEqual(slice_video.call_args.args[2:], (29.4, 16.2))

    def test_chunk_source_rejects_index_outside_saved_plan(self):
        directory = Path(TEMPORARY.name) / JOB_ID
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "input.mp4").write_bytes(b"master")
        (directory / "gpu-plan.json").write_text('{"chunks":[]}', encoding="utf-8")
        response = self.client.get(
            f"/v1/jobs/{JOB_ID}/chunks/9/source?token={self.token('result')}"
        )
        self.assertEqual(response.status_code, 404)

    def test_upload_rejects_claim_above_limit_before_writing(self):
        response = self.client.post(
            f"/v1/jobs/{JOB_ID}/upload",
            headers={
                "x-job-token": self.token("upload"),
                "x-file-size": str(SETTINGS.max_upload_bytes + 1),
            },
            files={"file": ("video.mp4", b"test", "video/mp4")},
        )
        self.assertEqual(response.status_code, 413)
        self.assertFalse((Path(TEMPORARY.name) / JOB_ID / "input.mp4").exists())

    @patch("app.main.shutil.disk_usage")
    @patch("app.main._validate_video")
    def test_upload_returns_per_file_digest(self, validate_video, disk_usage):
        disk_usage.return_value = shutil._ntuple_diskusage(200 * 1024**3, 10 * 1024**3, 190 * 1024**3)
        validate_video.return_value = {
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "duration": 5,
            "frames": 150,
            "has_audio": True,
        }
        response = self.client.post(
            f"/v1/jobs/{JOB_ID}/upload",
            headers={"x-job-token": self.token("upload"), "x-file-size": "4"},
            files={"file": ("video.mp4", b"test", "video/mp4")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["file_id"]), 64)
        repeated = self.client.post(
            f"/v1/jobs/{JOB_ID}/upload",
            headers={"x-job-token": self.token("upload"), "x-file-size": "4"},
            files={"file": ("video.mp4", b"test", "video/mp4")},
        )
        self.assertEqual(repeated.status_code, 409)

    @patch("app.main.shutil.disk_usage")
    @patch("app.main._validate_video")
    def test_raw_upload_and_input_confirmation(self, validate_video, disk_usage):
        disk_usage.return_value = shutil._ntuple_diskusage(200 * 1024**3, 10 * 1024**3, 190 * 1024**3)
        validate_video.return_value = {
            "width": 1280,
            "height": 720,
            "fps": 30,
            "duration": 2,
            "frames": 60,
            "has_audio": True,
        }
        uploaded = self.client.post(
            f"/v1/jobs/{JOB_ID}/upload",
            headers={
                "x-job-token": self.token("upload"),
                "x-file-size": "4",
                "x-file-name": "clip.mp4",
                "content-type": "video/mp4",
            },
            content=b"test",
        )
        confirmed = self.client.get(
            f"/v1/jobs/{JOB_ID}/input",
            headers={"x-job-token": self.token("control")},
        )
        self.assertEqual(uploaded.status_code, 200)
        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.json()["exists"])
        self.assertEqual(confirmed.json()["size"], 4)

    def test_result_requires_result_scope(self):
        directory = Path(TEMPORARY.name) / JOB_ID
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "output.mp4").write_bytes(b"result")
        missing = self.client.get(f"/v1/jobs/{JOB_ID}/result")
        wrong = self.client.get(
            f"/v1/jobs/{JOB_ID}/result", params={"token": self.token("control")}
        )
        valid = self.client.get(
            f"/v1/jobs/{JOB_ID}/result", params={"token": self.token("result")}
        )
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.content, b"result")

    def test_cleanup_removes_temporaries_and_preserves_repeatable_result(self):
        directory = Path(TEMPORARY.name) / JOB_ID
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "input.mp4").write_bytes(b"source")
        (directory / "preview.mp4").write_bytes(b"preview")
        (directory / "gpu-plan.json").write_text('{"chunks":[]}', encoding="utf-8")
        (directory / "state.json").write_text('{"status":"completed"}', encoding="utf-8")
        (directory / "output.mp4").write_bytes(b"result")
        (directory / "chunks").mkdir()
        (directory / "chunks" / "chunk-0.mp4").write_bytes(b"chunk")
        (directory / "gpu-sources").mkdir()
        (directory / "gpu-sources" / "source-0.mp4").write_bytes(b"source chunk")

        cleaned = self.client.post(
            f"/v1/jobs/{JOB_ID}/cleanup",
            headers={"x-job-token": self.token("control")},
        )
        first = self.client.get(
            f"/v1/jobs/{JOB_ID}/result", params={"token": self.token("result")}
        )
        second = self.client.get(
            f"/v1/jobs/{JOB_ID}/result", params={"token": self.token("result")}
        )

        self.assertEqual(cleaned.status_code, 200)
        self.assertTrue(cleaned.json()["result_preserved"])
        self.assertFalse((directory / "input.mp4").exists())
        self.assertFalse((directory / "preview.mp4").exists())
        self.assertFalse((directory / "gpu-plan.json").exists())
        self.assertFalse((directory / "chunks").exists())
        self.assertFalse((directory / "gpu-sources").exists())
        self.assertTrue((directory / "state.json").exists())
        self.assertEqual(first.content, b"result")
        self.assertEqual(second.content, b"result")

    def test_delete_removes_all_job_files_and_rejects_active_job(self):
        directory = Path(TEMPORARY.name) / JOB_ID
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "input.mp4").write_bytes(b"video")
        ACTIVE_JOBS.add(JOB_ID)
        try:
            active = self.client.delete(
                f"/v1/jobs/{JOB_ID}", headers={"x-job-token": self.token("control")}
            )
        finally:
            ACTIVE_JOBS.discard(JOB_ID)
        deleted = self.client.delete(
            f"/v1/jobs/{JOB_ID}", headers={"x-job-token": self.token("control")}
        )
        self.assertEqual(active.status_code, 409)
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(directory.exists())


if __name__ == "__main__":
    unittest.main()
