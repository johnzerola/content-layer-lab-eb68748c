"""Shell-free command builders and bounded subprocess supervision."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from typing import Protocol

from .registry import ModelRecipe, RegistryError


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class EngineExecutionError(RuntimeError):
    pass


def _cli_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else str(value)


@dataclass(frozen=True)
class EngineArtifacts:
    dialogue: Path
    music: Path
    report: Path
    log: Path


class EngineAdapter(Protocol):
    def command(self, source: Path, output_dir: Path, model_dir: Path) -> list[str]: ...
    def environment(self) -> dict[str, str]: ...
    def artifacts(self, output_dir: Path) -> EngineArtifacts: ...
    def finalize(self, artifacts: EngineArtifacts, processing_seconds: float) -> None: ...


def _base_environment(recipe: ModelRecipe) -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    env["TOKENIZERS_PARALLELISM"] = "false"
    if recipe.device == "cpu":
        env["CUDA_VISIBLE_DEVICES"] = ""
    elif "CUDA_VISIBLE_DEVICES" not in env:
        env["CUDA_VISIBLE_DEVICES"] = "0"
    return env


class DemucsAdapter:
    def __init__(self, recipe: ModelRecipe, python: str = sys.executable):
        if recipe.engine != "demucs":
            raise RegistryError("DemucsAdapter requires a demucs recipe.")
        recipe.require_executable()
        self.recipe = recipe
        self.python = python

    def command(self, source: Path, output_dir: Path, model_dir: Path) -> list[str]:
        args = [
            self.python,
            "-m",
            "demucs.separate",
            "-n",
            self.recipe.model_name,
            "--repo",
            str(model_dir),
            "--two-stems",
            "vocals",
            "--device",
            self.recipe.device,
            "--shifts",
            str(self.recipe.shifts),
        ]
        if self.recipe.segment_seconds is not None:
            args.extend(("--segment", _cli_number(self.recipe.segment_seconds)))
        if self.recipe.overlap is not None:
            args.extend(("--overlap", str(self.recipe.overlap)))
        args.extend(("-j", "0", "--float32", "-o", str(output_dir), str(source)))
        return args

    def environment(self) -> dict[str, str]:
        env = _base_environment(self.recipe)
        if env.get("AUDIO_MODEL_CACHE"):
            env["TORCH_HOME"] = env["AUDIO_MODEL_CACHE"]
        return env

    def artifacts(self, output_dir: Path) -> EngineArtifacts:
        stem_dir = output_dir / self.recipe.model_name / "input"
        return EngineArtifacts(
            dialogue=stem_dir / "vocals.wav",
            music=stem_dir / "no_vocals.wav",
            report=output_dir / "engine-result.json",
            log=output_dir / "engine.log",
        )

    def finalize(self, artifacts: EngineArtifacts, processing_seconds: float) -> None:
        artifacts.report.write_text(
            json.dumps(
                {
                    "ok": True,
                    "engine": "demucs",
                    "engine_version": self.recipe.engine_version,
                    "model": self.recipe.model_name,
                    "device_requested": self.recipe.device,
                    "precision_requested": self.recipe.precision,
                    "processing_seconds": round(processing_seconds, 3),
                    "outputs": {
                        "dialogue": str(artifacts.dialogue),
                        "music": str(artifacts.music),
                    },
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )


class AudioSeparatorAdapter:
    def __init__(self, recipe: ModelRecipe, python: str = sys.executable):
        if recipe.engine != "audio-separator":
            raise RegistryError("AudioSeparatorAdapter requires an audio-separator recipe.")
        recipe.require_executable()
        self.recipe = recipe
        self.python = python

    def command(self, source: Path, output_dir: Path, model_dir: Path) -> list[str]:
        args = [
            self.python,
            "-m",
            "app.audio_engines.audio_separator_runner",
            "--input",
            str(source),
            "--output-dir",
            str(output_dir),
            "--model-dir",
            str(model_dir),
            "--model",
            self.recipe.model_name,
            "--device",
            self.recipe.device,
            "--precision",
            self.recipe.precision,
            "--sample-rate",
            str(self.recipe.sample_rate),
        ]
        config = next(
            (item.filename for item in self.recipe.model_files if item.filename.endswith(".yaml")),
            None,
        )
        if config:
            args.extend(("--config", config))
        return args

    def environment(self) -> dict[str, str]:
        env = _base_environment(self.recipe)
        existing = env.get("PYTHONPATH")
        env["PYTHONPATH"] = (
            str(BACKEND_ROOT)
            if not existing
            else os.pathsep.join((str(BACKEND_ROOT), existing))
        )
        return env

    def artifacts(self, output_dir: Path) -> EngineArtifacts:
        return EngineArtifacts(
            dialogue=output_dir / "dialogue.wav",
            music=output_dir / "music.wav",
            report=output_dir / "engine-result.json",
            log=output_dir / "engine.log",
        )

    def finalize(self, artifacts: EngineArtifacts, processing_seconds: float) -> None:
        if not artifacts.report.is_file():
            raise EngineExecutionError("audio-separator did not publish its result report.")


def _terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    process.wait(timeout=15)


def _validate_artifacts(artifacts: EngineArtifacts) -> None:
    for path in (artifacts.dialogue, artifacts.music, artifacts.report):
        if not path.is_file() or path.stat().st_size < 2:
            raise EngineExecutionError(f"Engine did not publish required artifact: {path.name}")
    try:
        report = json.loads(artifacts.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EngineExecutionError("Engine result report is invalid.") from exc
    if report.get("ok") is not True:
        raise EngineExecutionError("Engine report did not confirm success.")


def run_engine_process(
    adapter: EngineAdapter,
    source: Path,
    output_dir: Path,
    model_dir: Path,
    cancel: threading.Event,
    timeout_seconds: int,
) -> EngineArtifacts:
    """Run one recipe once. Never retries or changes engine/device implicitly."""
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = adapter.artifacts(output_dir)
    started = time.monotonic()
    deadline = time.monotonic() + timeout_seconds
    with artifacts.log.open("wb") as log:
        process = subprocess.Popen(
            adapter.command(source, output_dir, model_dir),
            stdout=log,
            stderr=log,
            env=adapter.environment(),
            start_new_session=os.name != "nt",
        )
        try:
            while process.poll() is None:
                if cancel.wait(0.2):
                    raise EngineExecutionError("Audio separation cancelled.")
                if time.monotonic() >= deadline:
                    raise EngineExecutionError("Audio separation timed out.")
            if process.returncode != 0:
                raise EngineExecutionError(
                    f"Audio engine exited with code {process.returncode}; inspect engine.log."
                )
        finally:
            _terminate_process(process)
    adapter.finalize(artifacts, time.monotonic() - started)
    _validate_artifacts(artifacts)
    return artifacts
