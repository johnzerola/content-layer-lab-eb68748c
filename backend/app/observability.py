"""Failure-first diagnostics for bounded Cleaner worker executions.

The diagnostic directory lives outside the job directory so normal cleanup can
continue after evidence has been copied. Collection is opt-in and never changes
engine, mask, composition, or encoding decisions.
"""
from __future__ import annotations

import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
import traceback
from typing import Iterator


STAGES = (
    "01_download", "02_probe", "03_scene_detection", "04_mask_generation",
    "05_subtitle_policy", "06_roi_extraction", "07_engine_input",
    "08_diffueraser", "09_engine_output", "10_roi_restore",
    "11_subtitle_junctions", "12_selective_composition", "13_encode",
    "14_upload",
)
EVIDENCE_NAMES = (
    "state.json", "masks", "masks.mp4", "subtitle-policy", "diffueraser-run",
    "diffueraser-native.mp4", "subtitle-junctions", "composited.mp4",
    "output.mp4", "preview.mp4",
)


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _process_rss_bytes() -> int | None:
    try:
        import psutil  # type: ignore
        process = psutil.Process()
        return process.memory_info().rss + sum(
            child.memory_info().rss for child in process.children(recursive=True)
            if child.is_running()
        )
    except Exception:
        return None


def _gpu() -> dict:
    result = {"name": None, "vram_total_bytes": None,
              "vram_peak_bytes": None, "peak_scope": "parent torch allocator only"}
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            result.update(name=props.name, vram_total_bytes=int(props.total_memory),
                          vram_peak_bytes=int(torch.cuda.max_memory_allocated(0)))
    except Exception:
        pass
    return result


class FailureDiagnostics:
    """Record ordered checkpoints and persist a bounded bundle on failure."""

    def __init__(self, job_id: str, storage_root: Path, context: dict | None = None):
        self.job_id = job_id
        self.enabled = os.getenv("CLEANER_PERSIST_FAILURE_ARTIFACTS", "0") == "1"
        configured = os.getenv("CLEANER_FAILURE_STORAGE")
        self.root = Path(configured).resolve() if configured else (
            Path(storage_root).resolve() / "failure-bundles"
        )
        self.destination = self.root / job_id
        self.archive_path = self.root / f"{job_id}.zip"
        self.started_monotonic = time.perf_counter()
        self.ram_peak_bytes = _process_rss_bytes()
        self.report = {
            "schema": "cleaner-failure-bundle-v1",
            "job_id": job_id,
            "started_at": _utc(),
            "finished_at": None,
            "total_seconds": None,
            "status": "running",
            "last_successful_stage": None,
            "failed_stage": None,
            "stages": [
                {"name": name, "status": "pending", "started_at": None,
                 "ended_at": None, "duration_seconds": None}
                for name in STAGES
            ],
            "exception": None,
            "runtime": {"pid": os.getpid(), "ram_peak_bytes": self.ram_peak_bytes,
                        "gpu": _gpu()},
            "context": dict(context or {}),
            "geometry": {},
            "engine_process": {},
            "artifacts": [],
        }
        self._started = {}
        self._captured = False

    def _write_live_report(self) -> None:
        """Persist the current report outside the disposable job directory."""
        if not self.enabled:
            return
        self.destination.mkdir(parents=True, exist_ok=True)
        (self.destination / "diagnostic-report.json").write_text(
            json.dumps(self.report, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _entry(self, name: str) -> dict:
        for entry in self.report["stages"]:
            if entry["name"] == name:
                return entry
        raise ValueError(f"unknown diagnostic stage: {name}")

    def sample_resources(self) -> None:
        rss = _process_rss_bytes()
        if rss is not None:
            self.ram_peak_bytes = max(self.ram_peak_bytes or 0, rss)
            self.report["runtime"]["ram_peak_bytes"] = self.ram_peak_bytes
        current = _gpu()
        recorded = self.report["runtime"]["gpu"]
        if current["name"]:
            recorded["name"] = current["name"]
            recorded["vram_total_bytes"] = current["vram_total_bytes"]
        if current["vram_peak_bytes"] is not None:
            recorded["vram_peak_bytes"] = max(recorded.get("vram_peak_bytes") or 0,
                                               current["vram_peak_bytes"])

    def start(self, name: str, **metadata) -> None:
        entry = self._entry(name)
        if entry["status"] == "running":
            return
        entry.update(status="running", started_at=_utc(), metadata=metadata or {})
        self._started[name] = time.perf_counter()
        self.sample_resources()
        self._write_live_report()

    def finish(self, name: str, **metadata) -> None:
        entry = self._entry(name)
        started = self._started.pop(name, None)
        entry.update(status="success", ended_at=_utc(),
                     duration_seconds=round(time.perf_counter() - started, 6) if started else None)
        if metadata:
            entry.setdefault("metadata", {}).update(metadata)
        self.report["last_successful_stage"] = name
        self.sample_resources()
        self._write_live_report()

    def skip(self, name: str, reason: str) -> None:
        entry = self._entry(name)
        entry.update(status="skipped", ended_at=_utc(), duration_seconds=0.0,
                     metadata={"reason": reason})
        self._write_live_report()

    def fail_stage(self, name: str, exc: BaseException) -> None:
        entry = self._entry(name)
        started = self._started.pop(name, None)
        entry.update(status="failed", ended_at=_utc(),
                     duration_seconds=round(time.perf_counter() - started, 6) if started else None,
                     error={"type": type(exc).__name__, "message": str(exc)})
        self.report["failed_stage"] = name
        self.sample_resources()
        self._write_live_report()

    @contextmanager
    def stage(self, name: str, **metadata) -> Iterator[None]:
        self.start(name, **metadata)
        try:
            yield
        except BaseException as exc:
            self.fail_stage(name, exc)
            raise
        else:
            self.finish(name)

    def update(self, section: str, **values) -> None:
        self.report.setdefault(section, {}).update(values)
        self.sample_resources()

    def persist_checkpoint(self, name: str, source: str | Path) -> dict:
        """Copy a critical file immediately so later stages cannot erase it."""
        path = Path(source)
        record = {
            "checkpoint": name,
            "source": path.name,
            "path": f"checkpoints/{name}",
            "bytes": path.stat().st_size if path.is_file() else None,
            "sha256": _sha256(path) if path.is_file() else None,
            "copied": False,
        }
        if not path.is_file():
            record["reason"] = "source_missing"
        elif not self.enabled:
            record["reason"] = "persistence_disabled"
        else:
            max_bytes = int(os.getenv(
                "CLEANER_FAILURE_ARTIFACT_MAX_BYTES", str(4 * 1024 * 1024)
            ))
            if path.stat().st_size > max_bytes:
                record["reason"] = "larger_than_failure_artifact_limit"
            else:
                target = self.destination / "checkpoints" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
                record["copied"] = True
        self.report["artifacts"].append(record)
        self._write_live_report()
        return record

    def process(self, **values) -> None:
        command = values.get("command")
        if command:
            redacted = []
            hide_next = False
            for part in command:
                value = str(part)
                if hide_next:
                    redacted.append("<redacted>")
                    hide_next = False
                    continue
                lowered = value.lower()
                if any(marker in lowered for marker in ("token=", "password=", "secret=", "authorization=")):
                    key = value.split("=", 1)[0]
                    redacted.append(f"{key}=<redacted>")
                else:
                    redacted.append(value)
                    hide_next = lowered in ("--token", "--password", "--secret", "--authorization")
            values["command"] = redacted
        self.update("engine_process", **values)

    def _copy_evidence(self, work_dir: Path) -> None:
        evidence = self.destination / "artifacts"
        evidence.mkdir(parents=True, exist_ok=True)
        max_bytes = int(os.getenv("CLEANER_FAILURE_ARTIFACT_MAX_BYTES", str(4 * 1024 * 1024)))

        def copy_file(source: Path, target: Path) -> None:
            size = source.stat().st_size
            record = {
                "source": str(source.relative_to(work_dir)),
                "path": str(target.relative_to(self.destination)),
                "bytes": size,
                "sha256": _sha256(source),
                "copied": size <= max_bytes,
            }
            if record["copied"]:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
            else:
                record["reason"] = "larger_than_failure_artifact_limit"
            self.report["artifacts"].append(record)

        for name in EVIDENCE_NAMES:
            source = work_dir / name
            if not source.exists() or source.is_symlink():
                continue
            target = evidence / name
            if source.is_dir():
                for child in source.rglob("*"):
                    if (not child.is_file() or child.is_symlink()
                            or child.suffix.lower() in (".pth", ".safetensors")):
                        continue
                    copy_file(child, target / child.relative_to(source))
            else:
                copy_file(source, target)

    def capture_failure(self, work_dir: Path, exc: BaseException,
                        traceback_text: str | None = None) -> None:
        trace = traceback_text or traceback.format_exc()
        self.report.update(status="failed", finished_at=_utc(),
                           total_seconds=round(time.perf_counter() - self.started_monotonic, 6),
                           exception={"type": type(exc).__name__, "message": str(exc)})
        if not self.report.get("failed_stage"):
            running = [entry["name"] for entry in self.report["stages"]
                       if entry["status"] == "running"]
            self.report["failed_stage"] = running[-1] if running else "unclassified"
        if not self.enabled:
            return
        self.root.mkdir(parents=True, exist_ok=True)
        self.destination.mkdir(parents=True, exist_ok=True)
        (self.destination / "failure-traceback.txt").write_text(trace, encoding="utf-8")
        if not self._captured:
            self._copy_evidence(Path(work_dir))
            self._captured = True
        (self.destination / "failure-report.json").write_text(
            json.dumps(self.report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if self.archive_path.exists():
            self.archive_path.unlink()
        shutil.make_archive(str(self.archive_path.with_suffix("")), "zip",
                            root_dir=self.destination)

    def capture_success(self) -> None:
        """Finalize a successful run after its externally persisted uploads."""
        self.report.update(status="success", finished_at=_utc(),
                           total_seconds=round(time.perf_counter() - self.started_monotonic, 6),
                           exception=None)
        self.sample_resources()
        self._write_live_report()

    def response(self) -> dict:
        payload = {"diagnostic_report": self.report}
        if self.report.get("status") == "failed":
            payload["failure_report"] = self.report
        if self.enabled and self.archive_path.is_file():
            size = self.archive_path.stat().st_size
            payload.update(failure_bundle_bytes=size,
                           failure_bundle_sha256=_sha256(self.archive_path))
            if size <= int(os.getenv("CLEANER_FAILURE_INLINE_MAX_BYTES", str(8 * 1024 * 1024))):
                payload["failure_bundle_b64"] = base64.b64encode(
                    self.archive_path.read_bytes()).decode("ascii")
            else:
                payload["failure_bundle_inline"] = False
                payload["failure_bundle_path"] = str(self.archive_path)
        return payload
