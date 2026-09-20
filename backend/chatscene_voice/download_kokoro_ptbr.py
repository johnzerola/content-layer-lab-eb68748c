"""Download only the official Kokoro PT-BR voices at a pinned model revision."""

import hashlib
import os
from pathlib import Path

from huggingface_hub import hf_hub_download


REPO = "hexgrad/Kokoro-82M"
REVISION = "30618d04b530efb8e3ac3bace784f9d4a8dcaa01"
ROOT = Path(os.environ.get("CHATSCENE_KOKORO_MODEL_DIR", "/opt/chatscene-voice/kokoro"))
FILES = (
    "README.md",
    "config.json",
    "kokoro-v1_0.pth",
    "voices/pf_dora.pt",
    "voices/pm_alex.pt",
    "voices/pm_santa.pt",
)
VOICE_SHA_PREFIXES = {
    "pf_dora": "07e4ff98",
    "pm_alex": "cf0ba8c5",
    "pm_santa": "d4210316",
}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        path = Path(hf_hub_download(
            repo_id=REPO, revision=REVISION, filename=name, local_dir=ROOT,
        ))
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Arquivo do Kokoro ausente: {name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name.startswith("voices/"):
            voice_id = Path(name).stem
            if not digest.startswith(VOICE_SHA_PREFIXES[voice_id]):
                raise RuntimeError(f"Checksum divergente para {voice_id}")
        print(f"{name}\t{digest}")


if __name__ == "__main__":
    main()
