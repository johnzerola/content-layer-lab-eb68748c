"""Line-delimited JSON worker for approved OmniVoice catalogue profiles."""

import base64
import io
import json
import os
from pathlib import Path
import sys

from omnivoice_catalog import approved_voice_ids, load_model, write_wave


def main():
    model_path = Path(os.environ["CHATSCENE_OMNIVOICE_MODEL_PATH"]).resolve()
    catalog_dir = Path(os.environ["CHATSCENE_OMNIVOICE_CATALOG_DIR"]).resolve()
    model = load_model(model_path)
    from omnivoice import VoiceClonePrompt

    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            voice_id = request["voiceId"]
            text = request["text"]
            if voice_id not in approved_voice_ids(catalog_dir):
                raise ValueError("Voz não aprovada ou indisponível.")
            if not isinstance(text, str) or not 1 <= len(text) <= 600:
                raise ValueError("Texto inválido.")
            speed = float(request.get("speed", 1))
            if not 0.7 <= speed <= 1.3:
                raise ValueError("Velocidade inválida.")
            prompt = VoiceClonePrompt.load(str(catalog_dir / f"{voice_id}.pt"))
            audio = model.generate(
                text=text, language="pt", voice_clone_prompt=prompt, speed=speed,
            )[0]
            output = io.BytesIO()
            write_wave(output, audio, model.sampling_rate)
            print(json.dumps({
                "id": request.get("id"),
                "audio": base64.b64encode(output.getvalue()).decode("ascii"),
            }), flush=True)
        except Exception:
            print(json.dumps({"id": request.get("id") if isinstance(request, dict) else None,
                              "error": "Não foi possível gerar esta voz."}), flush=True)


if __name__ == "__main__":
    main()
