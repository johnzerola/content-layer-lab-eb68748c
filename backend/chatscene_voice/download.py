"""Install only the official multilingual assets used by the pinned runtime."""
import argparse
import json
import hashlib
from pathlib import Path
import urllib.request
import time
import zipfile

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

parser = argparse.ArgumentParser()
parser.add_argument("--directory", required=True)
args = parser.parse_args()
with urllib.request.urlopen("https://huggingface.co/api/models/ResembleAI/chatterbox/revision/5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18?blobs=true", timeout=60) as response:
    metadata = json.load(response)
revision = metadata["sha"]
directory = Path(args.directory)
directory.mkdir(parents=True, exist_ok=True)
files = {entry["rfilename"]: entry for entry in metadata["siblings"]}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


for name in ["ve.pt", "t3_mtl23ls_v2.safetensors", "s3gen.pt", "conds.pt", "grapheme_mtl_merged_expanded_v1.json", "Cangjie5_TC.json", "README.md"]:
    target = directory / name
    expected = files[name].get("lfs", {}).get("sha256")
    if target.exists() and target.stat().st_size == files[name].get("size"):
        if not expected or sha256(target) == expected:
            continue
    print(f"Downloading {name}", flush=True)
    partial = target.with_suffix(target.suffix + ".partial")
    expected_size = files[name].get("size", 0)
    for attempt in range(8):
        offset = partial.stat().st_size if partial.exists() else 0
        if expected_size and offset == expected_size:
            break
        request = urllib.request.Request(f"https://huggingface.co/ResembleAI/chatterbox/resolve/{revision}/{name}?download=true&offset={offset}", headers={"Range": f"bytes={offset}-"} if offset else {})
        try:
            with urllib.request.urlopen(request, timeout=120) as source:
                append = offset > 0 and source.status == 206
                with partial.open("ab" if append else "wb") as destination:
                    while chunk := source.read(4 * 1024 * 1024):
                        destination.write(chunk)
        except (OSError, TimeoutError):
            time.sleep(2)
    digest = sha256(partial)
    if expected and digest != expected:
        raise RuntimeError(f"Checksum mismatch: {name}")
    partial.replace(target)
Path(args.directory, "revision.json").write_text(json.dumps({"repository": "ResembleAI/chatterbox", "revision": revision}), encoding="utf-8")

# Chatterbox initializes its Chinese tokenizer even for Portuguese. Cache the
# official Explosion OntoNotes segmenter now so production inference remains
# offline and does not unexpectedly download on the first request.
pkuseg_directory = directory.parent / "cache" / "pkuseg"
pkuseg_directory.mkdir(parents=True, exist_ok=True)
pkuseg_archive = pkuseg_directory / "spacy_ontonotes.zip"
pkuseg_sha256 = "b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe"
if not pkuseg_archive.is_file() or sha256(pkuseg_archive) != pkuseg_sha256:
    partial = pkuseg_archive.with_suffix(".zip.partial")
    with urllib.request.urlopen("https://github.com/explosion/spacy-pkuseg/releases/download/v0.0.26/spacy_ontonotes.zip", timeout=120) as source, partial.open("wb") as destination:
        while chunk := source.read(4 * 1024 * 1024):
            destination.write(chunk)
    if sha256(partial) != pkuseg_sha256:
        raise RuntimeError("Checksum mismatch: spacy_ontonotes.zip")
    partial.replace(pkuseg_archive)
if not (pkuseg_directory / "spacy_ontonotes" / "weights.npz").is_file():
    with zipfile.ZipFile(pkuseg_archive) as archive:
        root = pkuseg_directory.resolve()
        if any(root not in (root / member).resolve().parents for member in archive.namelist()):
            raise RuntimeError("Unsafe path in spacy_ontonotes.zip")
        archive.extractall(pkuseg_directory)
print(json.dumps({"revision": revision, "directory": args.directory}))
