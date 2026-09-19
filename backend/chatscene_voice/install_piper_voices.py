"""Install pinned, commercially usable PT-BR Piper voices on the voice server.

Run explicitly on the server; the web app never downloads model weights.
"""

import argparse
import hashlib
import json
from pathlib import Path
import urllib.request


REVISION = "1b182b342fcce87f72d0e4fdf88131e5144f62d8"
MODELS = {
    "cadu": ("765f0809a6ea9035d4a6d0d008dbf8876e68b2dd32029312672fa8f405bdb535", 22050),
    "jeff": ("3a6f4c46355813c2b7bbc4d16b6d13d60ed72074b952a393baace82a7d0c94b5", 22050),
}


def download(url: str, target: Path, expected_sha256: str | None = None) -> None:
    partial = target.with_name(target.name + ".partial")
    digest = hashlib.sha256()
    request = urllib.request.Request(url, headers={"User-Agent": "ChatSceneVoiceInstaller/1.0"})
    with urllib.request.urlopen(request, timeout=120) as source, partial.open("wb") as output:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    if expected_sha256 and digest.hexdigest() != expected_sha256:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 inválido para {target.name}")
    partial.replace(target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--voices", nargs="+", choices=sorted(MODELS), default=list(MODELS))
    args = parser.parse_args()
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    for name in args.voices:
        model_hash, sample_rate = MODELS[name]
        stem = f"pt_BR-{name}-medium.onnx"
        base = f"https://huggingface.co/rhasspy/piper-voices/resolve/{REVISION}/pt/pt_BR/{name}/medium"
        model = directory / stem
        config = directory / f"{stem}.json"
        if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest() != model_hash:
            download(f"{base}/{stem}?download=true", model, model_hash)
        if not config.is_file():
            download(f"{base}/{stem}.json?download=true", config)
        data = json.loads(config.read_text(encoding="utf-8"))
        if data.get("audio", {}).get("sample_rate") != sample_rate or data.get("espeak", {}).get("voice") != "pt-br":
            raise RuntimeError(f"Configuração inesperada para {name}")
        print(f"{name}: instalado e verificado em {directory}")


if __name__ == "__main__":
    main()
