import json
from pathlib import Path

from app.observability import FailureDiagnostics, STAGES
from app.services.subtitle_junctions import refine_subtitle_scene
from types import SimpleNamespace


def test_failure_bundle_survives_job_cleanup(tmp_path, monkeypatch):
    monkeypatch.setenv("CLEANER_PERSIST_FAILURE_ARTIFACTS", "1")
    work = tmp_path / "job"
    (work / "subtitle-policy").mkdir(parents=True)
    (work / "state.json").write_text('{"status":"failed"}', encoding="utf-8")
    (work / "subtitle-policy" / "report.json").write_text("{}", encoding="utf-8")
    diagnostics = FailureDiagnostics("job-1", tmp_path)
    diagnostics.start("01_download")
    diagnostics.finish("01_download", bytes=123)
    try:
        with diagnostics.stage("02_probe"):
            raise ValueError("synthetic probe failure")
    except ValueError as exc:
        diagnostics.capture_failure(work, exc, "traceback: synthetic probe failure")
    report_path = tmp_path / "failure-bundles" / "job-1" / "failure-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert [stage["name"] for stage in report["stages"]] == list(STAGES)
    assert report["last_successful_stage"] == "01_download"
    assert report["failed_stage"] == "02_probe"
    assert report["exception"]["type"] == "ValueError"
    assert (report_path.parent / "failure-traceback.txt").is_file()
    assert (report_path.parent / "artifacts" / "state.json").is_file()
    assert (tmp_path / "failure-bundles" / "job-1.zip").is_file()
    response = diagnostics.response()
    assert response["failure_bundle_b64"]
    assert response["failure_bundle_sha256"]


def test_failure_bundle_hashes_but_does_not_inline_large_artifact(tmp_path, monkeypatch):
    monkeypatch.setenv("CLEANER_PERSIST_FAILURE_ARTIFACTS", "1")
    monkeypatch.setenv("CLEANER_FAILURE_ARTIFACT_MAX_BYTES", "4")
    work = tmp_path / "job"
    work.mkdir()
    (work / "output.mp4").write_bytes(b"larger than four bytes")
    diagnostics = FailureDiagnostics("job-large", tmp_path)
    exc = RuntimeError("synthetic")
    diagnostics.capture_failure(work, exc, "trace")
    report = diagnostics.report
    artifact = next(item for item in report["artifacts"] if item["source"] == "output.mp4")
    assert artifact["copied"] is False
    assert artifact["sha256"]
    assert not (diagnostics.destination / artifact["path"]).exists()


def test_subtitle_junctions_persists_failure_report(tmp_path):
    raw = tmp_path / "raw"
    composite = tmp_path / "composite"
    raw.mkdir()
    composite.mkdir()
    target = tmp_path / "junctions"
    info = SimpleNamespace(frames=1, width=64, height=64, fps=30)
    try:
        refine_subtitle_scene("missing.mp4", "missing.mp4", raw, composite,
                              target, info, [])
    except ValueError:
        pass
    report = json.loads((target / "subtitle-junctions.report.json").read_text(encoding="utf-8"))
    assert report["started"] is True
    assert report["completed"] is False
    assert report["failure"]["type"] == "ValueError"


def test_success_report_and_critical_checkpoint_survive_job_cleanup(tmp_path, monkeypatch):
    monkeypatch.setenv("CLEANER_PERSIST_FAILURE_ARTIFACTS", "1")
    work = tmp_path / "job"
    work.mkdir()
    upstream = work / "diffueraser_result.mp4"
    upstream.write_bytes(b"upstream-video")
    diagnostics = FailureDiagnostics("job-success", tmp_path)
    diagnostics.start("08_diffueraser")
    checkpoint = diagnostics.persist_checkpoint("08-diffueraser-output.mp4", upstream)
    diagnostics.finish("08_diffueraser")
    diagnostics.capture_success()
    assert checkpoint["copied"] is True
    assert (diagnostics.destination / "checkpoints" / "08-diffueraser-output.mp4").read_bytes() == b"upstream-video"
    report = json.loads((diagnostics.destination / "diagnostic-report.json").read_text(encoding="utf-8"))
    assert report["status"] == "success"
    assert diagnostics.response()["diagnostic_report"]["status"] == "success"
