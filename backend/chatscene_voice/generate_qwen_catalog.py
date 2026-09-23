"""Generate the licensed synthetic PT-BR reference catalog once.

The generated WAV files are deployment artifacts and are intentionally not
committed. Chatterbox reuses them as stable reference identities at runtime.
"""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--definitions", type=Path, default=Path(__file__).with_name("qwen-catalog.voices.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    definitions = json.loads(args.definitions.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)
    device = "cuda:0" if args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available()) else "cpu"
    dtype = torch.float16 if device.startswith("cuda") else torch.float32
    model = Qwen3TTSModel.from_pretrained(
        str(args.output.parent / "model"), device_map=device, dtype=dtype, attn_implementation="eager"
    )

    manifest = {key: definitions[key] for key in ("schemaVersion", "model", "modelRevision", "license", "language")}
    manifest["voices"] = []
    for voice in definitions["voices"]:
        target = args.output / f"{voice['id']}.wav"
        if args.force or not target.is_file():
            torch.manual_seed(int(voice["seed"]))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(int(voice["seed"]))
            wavs, sample_rate = model.generate_voice_design(
                text=definitions["referenceText"],
                language=definitions["language"],
                instruct=voice["instruct"],
            )
            raw = target.with_suffix(".raw.wav")
            sf.write(raw, wavs[0], sample_rate)
            subprocess.run(
                [
                    shutil.which("ffmpeg") or "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(raw), "-af",
                    "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-42dB:stop_periods=-1:stop_silence=0.12:stop_threshold=-42dB,loudnorm=I=-18:TP=-1.5:LRA=9",
                    "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(target),
                ],
                check=True,
            )
            raw.unlink(missing_ok=True)
        info = sf.info(target)
        manifest["voices"].append(
            {
                **{key: voice[key] for key in ("id", "name", "gender", "age", "style", "description", "seed")},
                "durationSec": round(info.duration, 3),
                "sha256": sha256(target),
            }
        )
        print(json.dumps({"voice": voice["id"], "durationSec": round(info.duration, 3)}, ensure_ascii=False), flush=True)

    (args.output / "catalog.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
