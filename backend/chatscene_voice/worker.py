"""Private stdio worker. One loaded model, serialized requests, no public port."""
import io
import json
import os
from pathlib import Path
import shutil
import sys
import time

config_path = Path(sys.argv[1])
runtime_config = json.loads(config_path.read_text(encoding="utf-8-sig")) if config_path.is_file() else {}
runtime_config.update({
    "pythonPath": os.environ.get("CHATSCENE_VOICE_PYTHON_PATH", runtime_config.get("pythonPath")),
    "modelPath": os.environ.get("CHATSCENE_VOICE_MODEL_PATH", runtime_config.get("modelPath")),
    "storagePath": os.environ.get("CHATSCENE_VOICE_STORAGE_PATH", runtime_config.get("storagePath")),
    "device": os.environ.get("CHATSCENE_VOICE_DEVICE", runtime_config.get("device", "auto")),
})
if not runtime_config.get("modelPath"):
    raise RuntimeError("CHATSCENE_VOICE_MODEL_PATH is required")
cache_root = Path(runtime_config["modelPath"]).parent / "cache"
os.environ.setdefault("HF_HOME", str(cache_root / "huggingface"))
os.environ.setdefault("TORCH_HOME", str(cache_root / "torch"))
os.environ.setdefault("NUMBA_CACHE_DIR", str(cache_root / "numba"))
os.environ.setdefault("PKUSEG_HOME", str(cache_root / "pkuseg"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
# The pinned tokenizer asks Hugging Face for this auxiliary mapping. Seed its
# offline cache from the verified model directory so inference never needs a
# network connection after installation.
model_cache = Path(runtime_config["modelPath"]) / "models--ResembleAI--chatterbox"
revision_file = Path(runtime_config["modelPath"]) / "revision.json"
try:
    revision = json.loads(revision_file.read_text(encoding="utf-8"))["revision"]
except (OSError, KeyError, ValueError):
    revision = "main"
hf_snapshot = model_cache / "snapshots" / revision
hf_snapshot.mkdir(parents=True, exist_ok=True)
refs = model_cache / "refs"
refs.mkdir(parents=True, exist_ok=True)
(refs / "main").write_text(revision, encoding="ascii")
for asset in ("Cangjie5_TC.json",):
    source = Path(runtime_config["modelPath"]) / asset
    target = hf_snapshot / asset
    if source.is_file() and not target.exists():
        shutil.copyfile(source, target)
os.environ.setdefault("HF_HUB_OFFLINE", "1")
protocol = sys.stdout
sys.stdout = sys.stderr

import numpy as np
import soundfile as sf
import torch
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def respond(value):
    protocol.write(json.dumps(value) + "\n")
    protocol.flush()


def main():
    import base64
    config = runtime_config
    requested = config.get("device", "auto")
    device = ("cuda" if torch.cuda.is_available() else "cpu") if requested == "auto" else requested
    torch.set_num_threads(min(6, os.cpu_count() or 2))
    original_torch_load = torch.load
    if device == "cpu":
        def cpu_torch_load(*args, **kwargs):
            kwargs.setdefault("map_location", torch.device("cpu"))
            return original_torch_load(*args, **kwargs)
        torch.load = cpu_torch_load
    try:
        model = ChatterboxMultilingualTTS.from_local(config["modelPath"], device)
    except Exception as exc:
        print(f"Voice model load failed ({type(exc).__name__})", file=sys.stderr, flush=True)
        respond({"error": "O motor local não conseguiu carregar os pesos instalados."})
        return
    finally:
        torch.load = original_torch_load
    respond({"ready": True, "device": device})
    for line in sys.stdin:
        request = json.loads(line)
        started = time.monotonic()
        try:
            text = request["text"]
            if not isinstance(text, str) or not 1 <= len(text) <= 600:
                raise ValueError("Invalid text length")
            # Every request supplies a reference; conditionals cannot leak between users.
            reference = Path(request["referencePath"])
            if not reference.is_file():
                raise ValueError("Reference missing")
            torch.manual_seed(42)
            if device == "cuda":
                torch.cuda.reset_peak_memory_stats()
            with torch.inference_mode():
                wav = model.generate(text, language_id="pt", audio_prompt_path=str(reference),
                                     exaggeration=0.5, cfg_weight=0.5, temperature=0.7)
            samples = wav.squeeze(0).detach().cpu().numpy()
            if not len(samples) or not np.isfinite(samples).all():
                raise ValueError("Invalid generated audio")
            output = io.BytesIO()
            sf.write(output, samples, model.sr, format="WAV", subtype="PCM_16")
            respond({"id": request["id"], "audio": base64.b64encode(output.getvalue()).decode("ascii"),
                     "durationSec": len(samples) / model.sr, "device": device,
                     "processingMs": round((time.monotonic() - started) * 1000),
                     "peakVramMb": round(torch.cuda.max_memory_allocated() / 1048576) if device == "cuda" else 0})
        except Exception as exc:
            # No reference paths, text or raw traceback in the client response.
            print(f"Voice generation failed ({type(exc).__name__})", file=sys.stderr, flush=True)
            respond({"id": request.get("id"), "error": "Falha na geração da voz de referência. Tente um trecho menor ou outra amostra."})
        finally:
            model.conds = None
            if device == "cuda":
                torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
