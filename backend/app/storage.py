from __future__ import annotations

import json
import math
import os
from pathlib import Path
import stat
import time
import uuid
from typing import Dict


TERMINAL_JOB_STATUSES = frozenset({"completed", "failed", "cancelled"})
# Positive eligibility avoids deleting a newly introduced processing stage.
RETENTION_ELIGIBLE_STATUSES = TERMINAL_JOB_STATUSES | {"uploaded"}
INTERMEDIATE_DIRECTORIES = frozenset({
    "scenes", "masks", "mask-review", "propainter-run", "diffueraser-run", "alternative",
    "gpu-sources", "chunks", "subtitle-policy", "inference-region", "inference_region",
})
INTERMEDIATE_FILES = frozenset({
    "gpu-plan.json", "masks.mp4", "input.preview.mp4", "video_only.mp4",
    "video_only.preview.mp4", "composited.mp4", "propainter-native.mp4",
    "propainter-delivery.mp4", "diffueraser-native.mp4", "diffueraser-delivery.mp4",
    "output.enhanced.mp4", "preview.enhanced.mp4", "output.post.mp4", ".input.upload",
    "subtitle-finished.mp4", "subtitle-finished.json",
})


class JobStillActive(RuntimeError):
    pass


def _is_link(path: Path) -> bool:
    """Do not traverse either POSIX symlinks or Windows reparse points."""
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def job_dir(storage_dir: Path, job_id: str) -> Path:
    uuid.UUID(job_id)
    root = storage_dir.resolve()
    candidate = root / job_id
    if _is_link(candidate):
        raise ValueError("job directory cannot be a link")
    target = candidate.resolve()
    if target.parent != root:
        raise ValueError("invalid job id")
    return target


def directory_size(path: Path) -> int:
    total = 0
    if not path.exists() or _is_link(path):
        return 0
    for item in path.iterdir():
        try:
            if _is_link(item):
                continue
            if item.is_dir():
                total += directory_size(item)
            elif item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def read_state(directory: Path) -> Dict[str, object]:
    try:
        path = directory / "state.json"
        if _is_link(path):
            return {}
        state = json.loads(path.read_text(encoding="utf-8"))
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def write_state(directory: Path, state: Dict[str, object]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    state = {**state, "updated_at": int(time.time())}
    temporary = directory / ".state.json.tmp"
    temporary.write_text(json.dumps(state, ensure_ascii=True), encoding="utf-8")
    os.replace(temporary, directory / "state.json")


def _remove_tree(path: Path, boundary: Path, report: dict) -> None:
    """Delete owned artifacts, skipping links even when they point inside storage."""
    try:
        if _is_link(path):
            report["skipped_links"] += 1
            return
        resolved = path.resolve()
        if not resolved.is_relative_to(boundary) or resolved == boundary:
            raise ValueError("cleanup target outside job directory")
        if path.is_dir():
            for child in path.iterdir():
                _remove_tree(child, boundary, report)
            # A skipped link or inaccessible artifact keeps its parent intact.
            if not any(path.iterdir()):
                path.rmdir()
        elif path.is_file():
            size = path.stat().st_size
            path.unlink()
            report["removed_files"] += 1
            report["removed_bytes"] += size
    except FileNotFoundError:
        pass
    except OSError:
        report["failed_paths"].append(str(path.relative_to(boundary)))


def cleanup_intermediates(storage_dir: Path, job_id: str, *, active_job_ids=()) -> dict:
    """Remove reproducible inference artifacts after execution has really stopped.

    Original, result, preview and state stay available until normal retention.
    Callers owning the execution marker must remove it only after all child
    processes have exited. A cancellation request alone is insufficient.
    """
    directory = job_dir(storage_dir, job_id)
    report = {"removed_files": 0, "removed_bytes": 0, "skipped_links": 0, "failed_paths": []}
    if not directory.exists():
        return report
    if (job_id in active_job_ids or (directory / ".processing").exists()
            or _is_link(directory / ".processing")
            or read_state(directory).get("status") not in TERMINAL_JOB_STATUSES):
        raise JobStillActive("job ainda esta em processamento ou sem estado final confirmado")
    for path in directory.iterdir():
        name = path.name
        if (name in INTERMEDIATE_DIRECTORIES or name in INTERMEDIATE_FILES
                or name.startswith(("inference_region_", "inference-region-"))
                or (name.startswith(".gpu-plan.") and name.endswith(".tmp"))):
            _remove_tree(path, directory, report)
    return report


def _process_identity(pid: int) -> tuple[bool | None, float | None]:
    """Return known liveness/start time without signalling a Windows process."""
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return (False, None) if ctypes.get_last_error() == 87 else (None, None)
        try:
            code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                return None, None
            if code.value != 259:  # STILL_ACTIVE
                return False, None
            created, exited, system, user = (wintypes.FILETIME() for _ in range(4))
            if kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in (created, exited, system, user))):
                ticks = (created.dwHighDateTime << 32) | created.dwLowDateTime
                return True, ticks / 10_000_000 - 11_644_473_600
            return True, None
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False, None
    except (PermissionError, OSError):
        return None, None
    try:
        process_stat = Path(f"/proc/{pid}/stat").read_text()
        start_ticks = int(process_stat[process_stat.rfind(")") + 2:].split()[19])
        boot = next(int(line.split()[1]) for line in Path("/proc/stat").read_text().splitlines()
                    if line.startswith("btime "))
        return True, boot + start_ticks / os.sysconf("SC_CLK_TCK")
    except (OSError, ValueError, IndexError, StopIteration):
        return True, None


def recover_stale_processing(storage_dir: Path, exclude_names=()) -> int:
    """Recover abandoned execution markers only when their owner cannot be live."""
    if not storage_dir.exists():
        return 0
    recovered = 0
    for directory in storage_dir.resolve().iterdir():
        if directory.name in exclude_names or _is_link(directory) or not directory.is_dir():
            continue
        marker = directory / ".processing"
        if _is_link(marker) or not marker.is_file():
            continue
        try:
            original = marker.read_text(encoding="utf-8")
            owner = json.loads(original)
            pid, started = int(owner["pid"]), float(owner["started_at"])
            if pid <= 0 or not math.isfinite(started) or started <= 0:
                continue
            alive, actual_start = _process_identity(pid)
            if alive is not False and not (alive is True and actual_start and actual_start > started + 2):
                continue
            if _is_link(marker) or marker.read_text(encoding="utf-8") != original:
                continue
            marker.unlink()
        except (OSError, ValueError, TypeError, KeyError):
            continue
        state = read_state(directory)
        if state.get("status") not in TERMINAL_JOB_STATUSES:
            state = {**state, "status": "failed", "stage": "processamento interrompido",
                     "error": "Processo anterior encerrado; entrada preservada para nova tentativa."}
            write_state(directory, state)
        try:
            cleanup_intermediates(storage_dir, directory.name)
        except (OSError, ValueError, JobStillActive):
            pass
        recovered += 1
    return recovered


def cleanup_expired(storage_dir: Path, retention_seconds: int, exclude_names=()) -> int:
    if not storage_dir.exists():
        return 0
    if not math.isfinite(retention_seconds) or retention_seconds <= 0:
        raise ValueError("retention must be a positive duration")
    root = storage_dir.resolve()
    cutoff = time.time() - retention_seconds
    removed = 0
    for directory in root.iterdir():
        if directory.name in exclude_names:
            continue
        if _is_link(directory) or not directory.is_dir() or directory.resolve().parent != root:
            continue
        state = read_state(directory)
        if (state.get("status") not in RETENTION_ELIGIBLE_STATUSES
                or (directory / ".processing").exists() or _is_link(directory / ".processing")):
            continue
        try:
            updated = float(state.get("updated_at") or directory.stat().st_mtime)
        except (OSError, TypeError, ValueError):
            continue
        if math.isfinite(updated) and updated < cutoff:
            report = {"removed_files": 0, "removed_bytes": 0, "skipped_links": 0, "failed_paths": []}
            _remove_tree(directory, root, report)
            if not directory.exists():
                removed += 1
    return removed
