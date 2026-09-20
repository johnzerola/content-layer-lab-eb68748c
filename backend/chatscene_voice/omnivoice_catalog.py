"""Build and serve reviewed, reusable OmniVoice voice identities.

Model weights are deliberately not downloaded by this module. The operator must
provide a locally licensed checkpoint and explicitly approve each audition.
"""

import argparse
import json
import os
from pathlib import Path
import re
import wave


CATALOG = Path(__file__).with_name("omnivoice_catalog.json")
SAFE_ID = re.compile(r"^omni-[a-z0-9-]+$")


def definitions():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    voices = data["voices"]
    ids = [item["id"] for item in voices]
    if len(ids) != len(set(ids)) or any(not SAFE_ID.fullmatch(item) for item in ids):
        raise ValueError("Catálogo OmniVoice contém identificadores inválidos.")
    return data


def approved_voice_ids(directory):
    directory = Path(directory)
    manifest = directory / "approved.json"
    if not manifest.is_file():
        return []
    try:
        approved = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, AttributeError):
        return []
    if not isinstance(approved, dict) or not isinstance(approved.get("voiceIds"), list):
        return []
    allowed = {voice["id"] for voice in definitions()["voices"]}
    return sorted(
        item for item in set(item for item in approved["voiceIds"] if isinstance(item, str))
        if item in allowed
        and (directory / f"{item}.pt").is_file()
        and (directory / f"{item}.wav").is_file()
    )


def write_wave(path, samples, sample_rate):
    import numpy as np

    pcm = (np.clip(np.asarray(samples).reshape(-1), -1, 1) * 32767).astype("<i2")
    destination = str(path) if isinstance(path, (str, Path)) else path
    with wave.open(destination, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(int(sample_rate))
        target.writeframes(pcm.tobytes())


def load_model(model_path):
    checkpoint = Path(model_path).resolve()
    if not checkpoint.is_dir():
        raise ValueError("O checkpoint licenciado deve existir localmente.")
    # The runtime must never silently fetch the public CC-BY-NC checkpoint.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    from omnivoice import OmniVoice

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device.startswith("cuda") else torch.float32
    return OmniVoice.from_pretrained(str(checkpoint), device_map=device, dtype=dtype)


def prepare(args):
    data = definitions()
    candidate = next((v for v in data["voices"] if v["id"] == args.voice), None)
    if not candidate:
        raise SystemExit("Identificador de voz desconhecido.")
    checkpoint = Path(args.model_path).resolve()
    if not checkpoint.is_dir():
        raise SystemExit("Forneça um checkpoint local autorizado; não há download automático.")
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    model = load_model(checkpoint)
    text = data["referenceText"]
    audio = model.generate(text=text, language="pt", instruct=candidate["instruct"])[0]
    wav = output / f"{args.voice}.wav"
    write_wave(wav, audio, model.sampling_rate)
    prompt = model.create_voice_clone_prompt(ref_audio=str(wav), ref_text=text)
    prompt.save(str(output / f"{args.voice}.pt"))
    print(f"Amostra para revisão: {wav}")
    print("A voz ainda não está disponível no produto. Revise pronúncia, identidade e timbre antes de aprovar.")


def approve(args):
    directory = Path(args.output).resolve()
    allowed = {item["id"] for item in definitions()["voices"]}
    if args.voice not in allowed:
        raise SystemExit("Identificador de voz desconhecido.")
    if not (directory / f"{args.voice}.pt").is_file() or not (directory / f"{args.voice}.wav").is_file():
        raise SystemExit("Gere e escute a amostra antes de aprovar.")
    existing = set(approved_voice_ids(directory))
    existing.add(args.voice)
    (directory / "approved.json").write_text(
        json.dumps({"voiceIds": sorted(existing)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Aprovada: {args.voice}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare_cmd = sub.add_parser("prepare")
    prepare_cmd.add_argument("--model-path", required=True)
    prepare_cmd.add_argument("--output", required=True)
    prepare_cmd.add_argument("--voice", required=True)
    prepare_cmd.set_defaults(run=prepare)
    approve_cmd = sub.add_parser("approve")
    approve_cmd.add_argument("--output", required=True)
    approve_cmd.add_argument("--voice", required=True)
    approve_cmd.set_defaults(run=approve)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
