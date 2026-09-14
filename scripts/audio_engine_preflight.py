"""Read-only AUD-03 runtime and registry preflight. It never downloads models."""

from __future__ import annotations

import argparse
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.audio_engines import ModelRegistry, RegistryError


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def nvidia_smi() -> dict[str, str] | None:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return None
    result = subprocess.run(
        [
            executable,
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return {"error": result.stderr.strip() or f"exit {result.returncode}"}
    name, memory_mib, driver = [item.strip() for item in result.stdout.splitlines()[0].split(",")]
    return {"name": name, "memory_mib": memory_mib, "driver": driver}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--registry",
        type=Path,
        default=ROOT / "research" / "audio-separation" / "model-registry.json",
    )
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    registry = ModelRegistry.load(args.registry)
    recipes = []
    for recipe in registry.all():
        item = {
            "id": recipe.id,
            "engine": recipe.engine,
            "device": recipe.device,
            "precision": recipe.precision,
            "execution_status": recipe.execution_status,
            "registry_executable": recipe.executable,
            "cache_verified": False,
        }
        if args.model_dir and recipe.executable:
            try:
                registry.verify_model_cache(recipe, args.model_dir)
                item["cache_verified"] = True
            except RegistryError as exc:
                item["cache_error"] = str(exc)
        recipes.append(item)

    torch_data: dict[str, object] = {
        "installed": importlib.util.find_spec("torch") is not None,
        "version": package_version("torch"),
        "cuda_build": None,
        "cuda_available": False,
    }
    if torch_data["installed"]:
        import torch

        torch_data.update(
            {
                "cuda_build": torch.version.cuda,
                "cuda_available": torch.cuda.is_available(),
            }
        )

    report = {
        "schema_version": 1,
        "python": {"executable": sys.executable, "version": platform.python_version()},
        "tools": {"ffmpeg": shutil.which("ffmpeg"), "ffprobe": shutil.which("ffprobe")},
        "packages": {
            "demucs": package_version("demucs"),
            "audio-separator": package_version("audio-separator"),
            "onnxruntime": package_version("onnxruntime"),
            "onnxruntime-gpu": package_version("onnxruntime-gpu"),
        },
        "torch": torch_data,
        "nvidia_smi": nvidia_smi(),
        "recipes": recipes,
        "ready_recipe_ids": [item["id"] for item in recipes if item["registry_executable"] and item["cache_verified"]],
    }
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
