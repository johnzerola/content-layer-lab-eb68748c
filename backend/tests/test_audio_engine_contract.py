import json
from pathlib import Path
import threading
from unittest.mock import MagicMock, patch

import pytest

from app.audio_engines import (
    AudioSeparatorAdapter,
    DemucsAdapter,
    EngineArtifacts,
    EngineExecutionError,
    ModelRegistry,
    RegistryError,
    run_engine_process,
)
from app.audio_engines.audio_separator_runner import _frozen_model_catalog, _resolve_outputs


REGISTRY = Path(__file__).resolve().parents[2] / "research" / "audio-separation" / "model-registry.json"


def ready_registry(tmp_path: Path, engine: str = "audio-separator") -> tuple[ModelRegistry, Path]:
    model = tmp_path / ("model.ckpt" if engine == "audio-separator" else "model.th")
    model.write_bytes(b"frozen-test-model")
    import hashlib

    raw = {
        "schema_version": 1,
        "recipes": [
            {
                "id": "ready",
                "engine": engine,
                "engine_version": "test",
                "package_license": "MIT",
                "code_repository": "https://example.invalid/repository",
                "code_revision": "test-revision",
                "model_name": model.name,
                "model_files": [
                    {
                        "filename": model.name,
                        "sha256": hashlib.sha256(model.read_bytes()).hexdigest(),
                        "source_url": "https://example.invalid/model",
                        "artifact_license": "MIT",
                        "license_evidence_url": "https://example.invalid/license",
                        "license_status": "APPROVED_FOR_RESEARCH",
                    }
                ],
                "expected_native_stems": ["Vocals", "Instrumental"],
                "output_semantics": {"Vocals": "dialogue", "Instrumental": "music_background"},
                "research_use_status": "APPROVED",
                "commercial_use_status": "REVIEW_REQUIRED",
                "redistribution_status": "REVIEW_REQUIRED",
                "attribution": "test",
                "known_training_datasets": [],
                "provenance_unknowns": [],
                "device": "cpu",
                "precision": "fp32",
                "sample_rate": 44100,
                "channels": 2,
                "timeout_seconds": 30,
                "segment_seconds": 7,
                "overlap": 0.25,
                "shifts": 0,
                "execution_status": "READY_FOR_RESEARCH",
            }
        ],
    }
    path = tmp_path / "registry.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return ModelRegistry.load(path), model.parent


def test_checked_in_registry_allows_only_frozen_verified_recipes():
    registry = ModelRegistry.load(REGISTRY)
    assert {recipe.id for recipe in registry.all()} == {
        "b0-htdemucs-cpu",
        "b1-htdemucs-ft-cpu",
        "b2-melband-roformer-vocals-cuda",
        "b3-mdx-inst-hq5-cuda",
    }
    assert [recipe.id for recipe in registry.all() if recipe.executable] == [
        "b0-htdemucs-cpu",
        "b2-melband-roformer-vocals-cuda",
    ]
    with pytest.raises(RegistryError, match="blocked"):
        registry.get("b3-mdx-inst-hq5-cuda")


def test_registry_verifies_cached_model_sha256(tmp_path):
    registry, model_dir = ready_registry(tmp_path)
    recipe = registry.get("ready")
    registry.verify_model_cache(recipe, model_dir)
    (model_dir / "model.ckpt").write_bytes(b"changed")
    with pytest.raises(RegistryError, match="SHA-256 mismatch"):
        registry.verify_model_cache(recipe, model_dir)


def test_audio_separator_adapter_pins_device_precision_and_cache(tmp_path):
    registry, model_dir = ready_registry(tmp_path)
    adapter = AudioSeparatorAdapter(registry.get("ready"), python="python-test")
    command = adapter.command(tmp_path / "input.wav", tmp_path / "out", model_dir)
    assert command[:3] == ["python-test", "-m", "app.audio_engines.audio_separator_runner"]
    assert command[command.index("--device") + 1] == "cpu"
    assert command[command.index("--precision") + 1] == "fp32"
    assert command[command.index("--model-dir") + 1] == str(model_dir)
    assert "--config" not in command
    assert adapter.environment()["CUDA_VISIBLE_DEVICES"] == ""
    assert str(Path(__file__).resolve().parents[1]) in adapter.environment()["PYTHONPATH"].split(
        __import__("os").pathsep
    )


def test_checked_in_roformer_adapter_passes_frozen_config():
    recipe = ModelRegistry.load(REGISTRY).get("b2-melband-roformer-vocals-cuda")
    command = AudioSeparatorAdapter(recipe, python="python-test").command(
        Path("input.wav"), Path("out"), Path("models")
    )
    assert command[command.index("--config") + 1] == "vocals_mel_band_roformer.yaml"


def test_demucs_adapter_preserves_two_stem_lossless_contract(tmp_path):
    registry, model_dir = ready_registry(tmp_path, engine="demucs")
    adapter = DemucsAdapter(registry.get("ready"), python="python-test")
    command = adapter.command(tmp_path / "input.wav", tmp_path / "out", model_dir)
    assert command[command.index("--two-stems") + 1] == "vocals"
    assert command[command.index("--device") + 1] == "cpu"
    assert command[command.index("--repo") + 1] == str(model_dir)
    assert command[command.index("--segment") + 1] == "7"
    assert "--float32" in command
    assert "--mp3" not in command


class FakeAdapter:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir

    def command(self, source, output_dir, model_dir):
        return ["fake-engine"]

    def environment(self):
        return {}

    def artifacts(self, output_dir):
        return EngineArtifacts(
            output_dir / "dialogue.wav",
            output_dir / "music.wav",
            output_dir / "engine-result.json",
            output_dir / "engine.log",
        )

    def finalize(self, artifacts, processing_seconds):
        return None


def test_process_runner_rejects_missing_outputs(tmp_path):
    process = MagicMock()
    process.poll.return_value = 0
    process.returncode = 0
    with patch("app.audio_engines.adapters.subprocess.Popen", return_value=process):
        with pytest.raises(EngineExecutionError, match="required artifact"):
            run_engine_process(
                FakeAdapter(tmp_path),
                tmp_path / "input.wav",
                tmp_path / "out",
                tmp_path / "models",
                threading.Event(),
                10,
            )


def test_process_runner_accepts_only_complete_success_report(tmp_path):
    output = tmp_path / "out"
    output.mkdir()
    (output / "dialogue.wav").write_bytes(b"wav")
    (output / "music.wav").write_bytes(b"wav")
    (output / "engine-result.json").write_text('{"ok": true}', encoding="utf-8")
    process = MagicMock()
    process.poll.return_value = 0
    process.returncode = 0
    with patch("app.audio_engines.adapters.subprocess.Popen", return_value=process):
        artifacts = run_engine_process(
            FakeAdapter(output),
            tmp_path / "input.wav",
            output,
            tmp_path / "models",
            threading.Event(),
            10,
        )
    assert artifacts.dialogue.read_bytes() == b"wav"


def test_audio_separator_output_mapping_requires_both_distinct_stems(tmp_path):
    dialogue = tmp_path / "demo_(Vocals).wav"
    music = tmp_path / "demo_(Instrumental).wav"
    assert _resolve_outputs([str(dialogue), str(music)], tmp_path) == (dialogue, music)
    other = tmp_path / "demo_(Other).wav"
    assert _resolve_outputs([str(dialogue), str(other)], tmp_path) == (dialogue, other)
    canonical_dialogue = tmp_path / "dialogue.wav"
    canonical_music = tmp_path / "music.wav"
    assert _resolve_outputs(
        [str(canonical_music), str(canonical_dialogue)], tmp_path
    ) == (canonical_dialogue, canonical_music)
    with pytest.raises(RuntimeError, match="Cannot map"):
        _resolve_outputs([str(dialogue)], tmp_path)


def test_frozen_catalog_does_not_require_remote_model_index():
    roformer = _frozen_model_catalog("model.ckpt", "model.yaml")
    assert roformer["MDXC"]["Frozen registry recipe"]["download_files"] == [
        "model.ckpt",
        "model.yaml",
    ]
    mdx = _frozen_model_catalog("model.onnx", None)
    assert mdx["MDX"]["Frozen registry recipe"]["download_files"] == ["model.onnx"]
    with pytest.raises(RuntimeError, match="Unsupported"):
        _frozen_model_catalog("model.ckpt", None)


def test_process_runner_honours_cancellation_without_retry(tmp_path):
    process = MagicMock()
    process.poll.return_value = None
    cancel = threading.Event()
    cancel.set()
    with (
        patch("app.audio_engines.adapters.subprocess.Popen", return_value=process),
        patch("app.audio_engines.adapters._terminate_process") as terminate,
    ):
        with pytest.raises(EngineExecutionError, match="cancelled"):
            run_engine_process(
                FakeAdapter(tmp_path),
                tmp_path / "input.wav",
                tmp_path / "out",
                tmp_path / "models",
                cancel,
                10,
            )
    terminate.assert_called_once_with(process)
