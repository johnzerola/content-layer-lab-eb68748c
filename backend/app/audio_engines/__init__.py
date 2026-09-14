"""Experimental audio-separation engine contracts.

Nothing in this package is imported by the production audio endpoint yet. The
registry must approve a recipe before an adapter may build an inference job.
"""

from .adapters import (
    AudioSeparatorAdapter,
    DemucsAdapter,
    EngineArtifacts,
    EngineExecutionError,
    run_engine_process,
)
from .registry import ModelRecipe, ModelRegistry, RegistryError

__all__ = [
    "AudioSeparatorAdapter",
    "DemucsAdapter",
    "EngineArtifacts",
    "EngineExecutionError",
    "ModelRecipe",
    "ModelRegistry",
    "RegistryError",
    "run_engine_process",
]
