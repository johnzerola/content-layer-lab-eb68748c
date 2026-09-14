#!/usr/bin/env python3
"""Run explicit, reproducible Demucs recipes for AUD-00.

This runner validates process and audio-output contracts. It never claims
perceptual quality and never downloads or selects a model implicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
from typing import Any

import numpy as np
from scipy.io import wavfile

from audio_benchmark_controls import evaluate


ALLOWED_MODELS = {"htdemucs", "htdemucs_ft", "mdx_extra"}
ALLOWED_DEVICES = {"cpu", "cuda"}
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audio_info(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=sample_rate,channels:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=20,
    )
    data = json.loads(completed.stdout)
    streams = data.get("streams", [])
    if len(streams) != 1:
        raise ValueError("EXPECTED_ONE_AUDIO_STREAM")
    return {
        "duration": float(data["format"]["duration"]),
        "sample_rate": int(streams[0]["sample_rate"]),
        "channels": int(streams[0]["channels"]),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def validate_recipe(raw: dict[str, Any]) -> dict[str, Any]:
    required = {"id", "model", "device"}
    if not required.issubset(raw):
        raise ValueError(f"RECIPE_MISSING_FIELDS:{','.join(sorted(required - raw.keys()))}")
    recipe_id = str(raw["id"])
    model, device = str(raw["model"]), str(raw["device"])
    if not SAFE_ID.fullmatch(recipe_id):
        raise ValueError("RECIPE_ID_INVALID")
    if model not in ALLOWED_MODELS or device not in ALLOWED_DEVICES:
        raise ValueError("RECIPE_NOT_ALLOWLISTED")
    timeout = float(raw.get("timeout_seconds", 900))
    shifts = int(raw.get("shifts", 0))
    segment = int(raw.get("segment", 7))
    overlap = float(raw.get("overlap", 0.25))
    if not 0 < timeout <= 3600 or not 0 <= shifts <= 2:
        raise ValueError("RECIPE_LIMIT_INVALID")
    if not 1 <= segment <= 60 or not 0.1 <= overlap <= 0.75:
        raise ValueError("RECIPE_LIMIT_INVALID")
    return {"id": recipe_id, "model": model, "device": device,
            "timeout_seconds": timeout, "shifts": shifts,
            "segment": segment, "overlap": overlap}


def load_manifest(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("UNSUPPORTED_MANIFEST_VERSION")
    fixtures, recipes = data.get("fixtures"), data.get("recipes")
    if not isinstance(fixtures, list) or not fixtures:
        raise ValueError("FIXTURES_REQUIRED")
    if not isinstance(recipes, list) or not recipes:
        raise ValueError("RECIPES_REQUIRED")
    resolved = []
    for fixture in fixtures:
        try:
            fixture_id = str(fixture["id"])
            entries = fixture["files"]
        except (KeyError, TypeError):
            raise ValueError("FIXTURE_INPUT_INVALID") from None
        if not SAFE_ID.fullmatch(fixture_id):
            raise ValueError("FIXTURE_ID_INVALID")
        resolved_files: dict[str, Path] = {}
        for role in ("input", "dialogue", "music"):
            entry = entries.get(role)
            if role == "input" and not isinstance(entry, dict):
                raise ValueError("FIXTURE_INPUT_INVALID")
            if not isinstance(entry, dict):
                continue
            try:
                source = (path.parent / entry["path"]).resolve()
                expected_hash = str(entry["sha256"])
            except (KeyError, TypeError):
                raise ValueError(f"FIXTURE_FILE_INVALID:{fixture_id}:{role}") from None
            if not source.is_file() or sha256(source) != expected_hash:
                raise ValueError(f"FIXTURE_HASH_OR_FILE_INVALID:{fixture_id}:{role}")
            resolved_files[role] = source
        if ("dialogue" in resolved_files) != ("music" in resolved_files):
            raise ValueError(f"FIXTURE_GROUND_TRUTH_INCOMPLETE:{fixture_id}")
        resolved.append({"id": fixture_id, "source": resolved_files["input"],
                         "ground_truth": {role: resolved_files[role]
                                          for role in ("dialogue", "music")
                                          if role in resolved_files}})
    return resolved, [validate_recipe(recipe) for recipe in recipes]


def demucs_command(source: Path, output: Path, recipe: dict[str, Any]) -> list[str]:
    return [sys.executable, "-m", "demucs.separate", "-n", recipe["model"],
            "--two-stems", "vocals", "--device", recipe["device"],
            "--shifts", str(recipe["shifts"]), "--segment", str(recipe["segment"]),
            "--overlap", str(recipe["overlap"]), "-j", "0", "--float32",
            "-o", str(output), str(source)]


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True, timeout=5, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=2)


def execute(command: list[str], timeout: float) -> tuple[int, str, str]:
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=os.name != "nt")
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return process.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        stop_process(process)
        return -1, "", "TIMEOUT"


def read_pcm(path: Path) -> tuple[int, np.ndarray]:
    rate, pcm = wavfile.read(path)
    if pcm.ndim == 1:
        pcm = pcm[:, None]
    if np.issubdtype(pcm.dtype, np.integer):
        info = np.iinfo(pcm.dtype)
        scale = float(max(abs(info.min), info.max))
        pcm = pcm.astype(np.float64) / scale
    else:
        pcm = pcm.astype(np.float64)
    return int(rate), pcm


def ground_truth_metrics(stems: dict[str, Any], ground_truth: dict[str, Path]) -> dict[str, Any]:
    if not ground_truth:
        return {"status": "NOT_AVAILABLE"}
    estimates, truths = {}, {}
    for role in ("dialogue", "music"):
        estimate_rate, estimates[role] = read_pcm(Path(stems[role]["path"]))
        truth_rate, truths[role] = read_pcm(ground_truth[role])
        if estimate_rate != truth_rate:
            raise ValueError(f"GROUND_TRUTH_RATE_MISMATCH:{role}")
    dialogue = evaluate(estimates["dialogue"], truths["dialogue"])
    music = evaluate(estimates["music"], truths["music"])
    reconstructed = estimates["dialogue"] + estimates["music"]
    original = truths["dialogue"] + truths["music"]
    reconstruction = evaluate(reconstructed, original)
    return {"status": "METRICS_ONLY_NOT_PERCEPTUAL", "dialogue": dialogue,
            "music": music, "reconstruction": reconstruction}


def validate_outputs(fixture: dict[str, Any], output: Path,
                     recipe: dict[str, Any]) -> dict[str, Any]:
    source = fixture["source"]
    root = output / recipe["model"] / source.stem
    expected = {"dialogue": root / "vocals.wav", "music": root / "no_vocals.wav"}
    source_info = audio_info(source)
    stems: dict[str, Any] = {}
    for role, path in expected.items():
        if not path.is_file() or path.stat().st_size < 128:
            raise ValueError(f"OUTPUT_MISSING_OR_EMPTY:{role}")
        info = audio_info(path)
        if abs(info["duration"] - source_info["duration"]) > 0.02:
            raise ValueError(f"OUTPUT_DURATION_MISMATCH:{role}")
        if info["sample_rate"] != source_info["sample_rate"]:
            raise ValueError(f"OUTPUT_SAMPLE_RATE_MISMATCH:{role}")
        if info["channels"] != source_info["channels"]:
            raise ValueError(f"OUTPUT_CHANNELS_MISMATCH:{role}")
        stems[role] = {"path": str(path), **info}
    return {"input": source_info, "stems": stems,
            "ground_truth_metrics": ground_truth_metrics(
                stems, fixture.get("ground_truth", {}))}


def run_fixture(fixture: dict[str, Any], recipe: dict[str, Any], root: Path,
                command_factory=demucs_command) -> dict[str, Any]:
    target = root / fixture["id"] / recipe["id"]
    target.mkdir(parents=True, exist_ok=False)
    command = command_factory(fixture["source"], target, recipe)
    started = time.perf_counter()
    returncode, stdout, stderr = execute(command, recipe["timeout_seconds"])
    result: dict[str, Any] = {
        "fixture_id": fixture["id"], "recipe": recipe,
        "seconds": round(time.perf_counter() - started, 3),
        "returncode": returncode, "quality_status": "NOT_EVALUATED",
    }
    if returncode != 0:
        result["status"] = "TIMEOUT" if stderr == "TIMEOUT" else "PROCESS_FAILED"
        result["error"] = (stderr or stdout)[-1200:]
        return result
    try:
        result["artifacts"] = validate_outputs(fixture, target, recipe)
        result["status"] = "TECHNICAL_PASS"
    except (ValueError, subprocess.SubprocessError, json.JSONDecodeError, OSError) as error:
        result["status"] = "OUTPUT_INVALID"
        result["error"] = str(error)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output directory already exists")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        parser.error("ffmpeg and ffprobe are required")
    try:
        fixtures, recipes = load_manifest(args.manifest.resolve())
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))
    args.output.mkdir(parents=True)
    results = [run_fixture(fixture, recipe, args.output)
               for fixture in fixtures for recipe in recipes]
    report = {
        "schema_version": 1, "manifest": str(args.manifest.resolve()),
        "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True,
                                  text=True, timeout=10).stdout.splitlines()[0],
        "quality_status": "NOT_EVALUATED", "results": results,
    }
    report["status"] = "TECHNICAL_PASS" if all(
        item["status"] == "TECHNICAL_PASS" for item in results) else "TECHNICAL_FAIL"
    (args.output / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"status": report["status"], "runs": len(results)}))
    return 0 if report["status"] == "TECHNICAL_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
