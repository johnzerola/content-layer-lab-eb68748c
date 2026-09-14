"""Validated, fail-closed registry for experimental separation recipes."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Literal


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
EngineName = Literal["demucs", "audio-separator"]
DeviceName = Literal["cpu", "cuda"]
PrecisionName = Literal["fp32", "autocast", "native-fp16"]


class RegistryError(ValueError):
    """The requested recipe is missing provenance or violates the contract."""


@dataclass(frozen=True)
class ModelFile:
    filename: str
    sha256: str | None
    source_url: str | None
    artifact_license: str
    license_evidence_url: str | None
    license_status: str

    @property
    def executable(self) -> bool:
        return (
            bool(self.filename)
            and bool(self.sha256 and SHA256_RE.fullmatch(self.sha256))
            and bool(self.source_url and self.source_url.startswith("https://"))
            and self.artifact_license != "UNVERIFIED"
            and bool(
                self.license_evidence_url
                and self.license_evidence_url.startswith("https://")
            )
            and self.license_status == "APPROVED_FOR_RESEARCH"
        )


@dataclass(frozen=True)
class ModelRecipe:
    id: str
    engine: EngineName
    engine_version: str
    package_license: str
    code_repository: str
    code_revision: str
    model_name: str
    model_files: tuple[ModelFile, ...]
    expected_native_stems: tuple[str, ...]
    output_semantics: tuple[tuple[str, str], ...]
    research_use_status: str
    commercial_use_status: str
    redistribution_status: str
    attribution: str
    known_training_datasets: tuple[str, ...]
    provenance_unknowns: tuple[str, ...]
    device: DeviceName
    precision: PrecisionName
    sample_rate: int
    channels: int
    timeout_seconds: int
    segment_seconds: float | None
    overlap: float | None
    shifts: int
    execution_status: str
    notes: str

    @property
    def executable(self) -> bool:
        return (
            self.execution_status == "READY_FOR_RESEARCH"
            and self.research_use_status == "APPROVED"
            and bool(self.model_files)
            and all(item.executable for item in self.model_files)
        )

    def require_executable(self) -> None:
        if self.executable:
            return
        missing = []
        if self.execution_status != "READY_FOR_RESEARCH":
            missing.append(f"status={self.execution_status}")
        for item in self.model_files:
            if not item.executable:
                missing.append(f"model_file={item.filename}:provenance_or_license_incomplete")
        raise RegistryError(
            f"Recipe {self.id!r} is blocked ({', '.join(missing) or 'no approved model files'})."
        )


def _required(mapping: dict[str, Any], key: str, owner: str) -> Any:
    if key not in mapping:
        raise RegistryError(f"{owner} is missing {key!r}.")
    return mapping[key]


def _parse_recipe(raw: dict[str, Any]) -> ModelRecipe:
    recipe_id = str(_required(raw, "id", "recipe"))
    engine = _required(raw, "engine", recipe_id)
    if engine not in ("demucs", "audio-separator"):
        raise RegistryError(f"{recipe_id} has unsupported engine {engine!r}.")
    device = _required(raw, "device", recipe_id)
    if device not in ("cpu", "cuda"):
        raise RegistryError(f"{recipe_id} has unsupported device {device!r}.")
    precision = _required(raw, "precision", recipe_id)
    if precision not in ("fp32", "autocast", "native-fp16"):
        raise RegistryError(f"{recipe_id} has unsupported precision {precision!r}.")
    if device == "cpu" and precision != "fp32":
        raise RegistryError(f"{recipe_id} must use fp32 on CPU.")

    model_files = tuple(
        ModelFile(
            filename=str(_required(item, "filename", recipe_id)),
            sha256=item.get("sha256"),
            source_url=item.get("source_url"),
            artifact_license=str(_required(item, "artifact_license", recipe_id)),
            license_evidence_url=item.get("license_evidence_url"),
            license_status=str(_required(item, "license_status", recipe_id)),
        )
        for item in _required(raw, "model_files", recipe_id)
    )
    if not model_files:
        raise RegistryError(f"{recipe_id} must declare at least one model file.")

    sample_rate = int(_required(raw, "sample_rate", recipe_id))
    channels = int(_required(raw, "channels", recipe_id))
    timeout_seconds = int(_required(raw, "timeout_seconds", recipe_id))
    shifts = int(raw.get("shifts", 0))
    overlap = raw.get("overlap")
    segment_seconds = raw.get("segment_seconds")
    if sample_rate not in (44100, 48000):
        raise RegistryError(f"{recipe_id} has unsupported sample rate {sample_rate}.")
    if channels not in (1, 2):
        raise RegistryError(f"{recipe_id} has unsupported channel count {channels}.")
    if not 1 <= timeout_seconds <= 7200:
        raise RegistryError(f"{recipe_id} has invalid timeout.")
    if shifts < 0 or shifts > 10:
        raise RegistryError(f"{recipe_id} has invalid shifts.")
    if overlap is not None and not 0 <= float(overlap) < 1:
        raise RegistryError(f"{recipe_id} has invalid overlap.")
    if segment_seconds is not None and float(segment_seconds) <= 0:
        raise RegistryError(f"{recipe_id} has invalid segment size.")

    return ModelRecipe(
        id=recipe_id,
        engine=engine,
        engine_version=str(_required(raw, "engine_version", recipe_id)),
        package_license=str(_required(raw, "package_license", recipe_id)),
        code_repository=str(_required(raw, "code_repository", recipe_id)),
        code_revision=str(_required(raw, "code_revision", recipe_id)),
        model_name=str(_required(raw, "model_name", recipe_id)),
        model_files=model_files,
        expected_native_stems=tuple(_required(raw, "expected_native_stems", recipe_id)),
        output_semantics=tuple(
            sorted(_required(raw, "output_semantics", recipe_id).items())
        ),
        research_use_status=str(_required(raw, "research_use_status", recipe_id)),
        commercial_use_status=str(_required(raw, "commercial_use_status", recipe_id)),
        redistribution_status=str(_required(raw, "redistribution_status", recipe_id)),
        attribution=str(_required(raw, "attribution", recipe_id)),
        known_training_datasets=tuple(raw.get("known_training_datasets", ())),
        provenance_unknowns=tuple(raw.get("provenance_unknowns", ())),
        device=device,
        precision=precision,
        sample_rate=sample_rate,
        channels=channels,
        timeout_seconds=timeout_seconds,
        segment_seconds=float(segment_seconds) if segment_seconds is not None else None,
        overlap=float(overlap) if overlap is not None else None,
        shifts=shifts,
        execution_status=str(_required(raw, "execution_status", recipe_id)),
        notes=str(raw.get("notes", "")),
    )


class ModelRegistry:
    def __init__(self, recipes: tuple[ModelRecipe, ...], source: Path):
        self.source = source
        self._recipes = {recipe.id: recipe for recipe in recipes}
        if len(self._recipes) != len(recipes):
            raise RegistryError("Recipe ids must be unique.")

    @classmethod
    def load(cls, path: Path) -> "ModelRegistry":
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RegistryError(f"Cannot read registry {path}: {exc}") from exc
        if raw.get("schema_version") != 1:
            raise RegistryError("Unsupported model registry schema.")
        recipes = tuple(_parse_recipe(item) for item in _required(raw, "recipes", "registry"))
        return cls(recipes, path)

    def all(self) -> tuple[ModelRecipe, ...]:
        return tuple(self._recipes.values())

    def get(self, recipe_id: str, *, require_executable: bool = True) -> ModelRecipe:
        try:
            recipe = self._recipes[recipe_id]
        except KeyError as exc:
            raise RegistryError(f"Unknown audio recipe {recipe_id!r}.") from exc
        if require_executable:
            recipe.require_executable()
        return recipe

    def verify_model_cache(self, recipe: ModelRecipe, model_dir: Path) -> None:
        recipe.require_executable()
        for model_file in recipe.model_files:
            path = model_dir / model_file.filename
            if not path.is_file():
                raise RegistryError(f"Missing cached model file: {path}")
            hasher = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(block)
            digest = hasher.hexdigest()
            if digest != model_file.sha256:
                raise RegistryError(f"SHA-256 mismatch for {model_file.filename}.")
