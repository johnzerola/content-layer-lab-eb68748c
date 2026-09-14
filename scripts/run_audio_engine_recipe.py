"""Run one frozen AUD-03 recipe without changing the production endpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import threading


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.audio_engines import (
    AudioSeparatorAdapter,
    DemucsAdapter,
    ModelRegistry,
    run_engine_process,
)


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument(
        "--registry",
        type=Path,
        default=ROOT / "research" / "audio-separation" / "model-registry.json",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    registry = ModelRegistry.load(args.registry)
    recipe = registry.get(args.recipe)
    registry.verify_model_cache(recipe, args.model_dir)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    frozen_input = args.output_dir / "input.wav"
    shutil.copyfile(args.input, frozen_input)
    adapter = (
        DemucsAdapter(recipe, python=args.python)
        if recipe.engine == "demucs"
        else AudioSeparatorAdapter(recipe, python=args.python)
    )
    artifacts = run_engine_process(
        adapter,
        frozen_input,
        args.output_dir / "raw",
        args.model_dir,
        threading.Event(),
        recipe.timeout_seconds,
    )
    run_report = {
        "schema_version": 1,
        "recipe": recipe.id,
        "input": {"path": str(args.input), "sha256": sha256(args.input)},
        "runtime": {"python": args.python},
        "outputs": {
            "dialogue": {"path": str(artifacts.dialogue), "sha256": sha256(artifacts.dialogue)},
            "music": {"path": str(artifacts.music), "sha256": sha256(artifacts.music)},
        },
        "engine_report": json.loads(artifacts.report.read_text(encoding="utf-8")),
    }
    report_path = args.output_dir / "run-report.json"
    report_path.write_text(json.dumps(run_report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(run_report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
