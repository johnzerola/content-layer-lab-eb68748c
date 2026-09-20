"""Install the pinned official PT-BR V3 checkpoint beside the V2 model.

This installs a synthesis model, not a catalogue of speaker identities.
Reference voices must be supplied separately with appropriate permission.
"""

import argparse
import hashlib
import json
from pathlib import Path
import shutil

try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

from huggingface_hub import snapshot_download


REPOSITORY = "ResembleAI/Chatterbox-Multilingual-pt-br"
REVISION = "b3952f18bc2eaa72b9bd7c17d2c4653bcad4770d"
HASHES = {
    "t3_pt_br.safetensors": "074aaf65255eb9cb960288f7cc72e09d3b5008f6e0b14868c0d4e5b0bd7cbb6c",
    "s3gen_v3.safetensors": "4a46190f3dccc2230fbb3488a930bccc925862ee68f2662433dfcfe93ce6c2cb",
    "grapheme_mtl_merged_expanded_v1.json": "69632f47220a788a52ce2661d096453c5655e9bf25289d89a8d832c46ee07dbf",
    "ve.pt": "4b16d836bc598509860f6fa068165a8bb5e9ac84f05582dfcf278a5a372879f1",
    "Cangjie5_TC.json": "7073fd9de919443ae88e0bd2449917a65fe54898a4413ed1edcc4b67f28bce8c",
}


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(4 * 1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


def install(directory: Path, base_directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=REPOSITORY,
        revision=REVISION,
        local_dir=str(directory),
        allow_patterns=["README.md", "t3_pt_br.safetensors", "s3gen_v3.safetensors", "grapheme_mtl_merged_expanded_v1.json"],
    )
    for name in ("ve.pt", "Cangjie5_TC.json"):
        source = base_directory / name
        if not source.is_file() or digest(source) != HASHES[name]:
            raise RuntimeError(f"Verified base asset missing: {name}")
        target = directory / name
        if not target.is_file() or digest(target) != HASHES[name]:
            shutil.copyfile(source, target)
    for name, expected in HASHES.items():
        if not (directory / name).is_file() or digest(directory / name) != expected:
            raise RuntimeError(f"PT-BR V3 checksum mismatch: {name}")
    (directory / "revision.json").write_text(
        json.dumps({"repository": REPOSITORY, "revision": REVISION}), encoding="utf-8"
    )
    print(json.dumps({"repository": REPOSITORY, "revision": REVISION, "directory": str(directory)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--base-directory", type=Path, required=True)
    options = parser.parse_args()
    install(options.directory, options.base_directory)
