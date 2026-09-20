"""Persistent, offline Kokoro PT-BR worker for three official voice identities.

Each stdin line is one JSON request; each stdout line is one JSON response.
No user text or generated audio is persisted by this process.
"""

import base64
import io
import json
import math
import os
from pathlib import Path
import sys
import wave

import numpy as np
import torch
from kokoro import KModel, KPipeline


ROOT = Path(os.environ.get("CHATSCENE_KOKORO_MODEL_DIR", "/opt/chatscene-voice/kokoro")).resolve()
VOICE_IDS = frozenset(("pf_dora", "pm_alex", "pm_santa"))
SAMPLE_RATE = 24000


def load_pipeline():
    model = KModel(
        repo_id="hexgrad/Kokoro-82M",
        config=str(ROOT / "config.json"),
        model=str(ROOT / "kokoro-v1_0.pth"),
    ).to("cpu").eval()
    return KPipeline(lang_code="p", model=model, repo_id="hexgrad/Kokoro-82M", device="cpu")


def synthesize(pipeline, text, voice_id, speed):
    if voice_id not in VOICE_IDS:
        raise ValueError("Voz PT-BR não autorizada.")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 600:
        raise ValueError("Texto deve ter entre 1 e 600 caracteres.")
    if not isinstance(speed, (int, float)) or not math.isfinite(speed) or not 0.7 <= speed <= 1.3:
        raise ValueError("Velocidade fora do limite.")
    # Non-English Kokoro can truncate long phoneme strings. Short segments keep
    # every phrase and avoid treating one long message as a single utterance.
    words = text.split()
    segments = []
    segment = ""
    for word in words:
        if len(word) > 180:
            raise ValueError("Palavra longa demais para a síntese de voz.")
        if segment and len(segment) + len(word) + 1 > 180:
            segments.append(segment)
            segment = word
        else:
            segment = f"{segment} {word}".strip()
    if segment:
        segments.append(segment)
    chunks = []
    voice_path = str(ROOT / "voices" / f"{voice_id}.pt")
    with torch.inference_mode():
        for segment in segments:
            for result in pipeline(segment, voice=voice_path, speed=float(speed)):
                if result.audio is not None and result.audio.numel():
                    chunks.append(result.audio.numpy())
    if not chunks:
        raise RuntimeError("A voz selecionada não produziu áudio.")
    audio = np.concatenate(chunks)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    result = io.BytesIO()
    with wave.open(result, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    return result.getvalue()


def main():
    try:
        pipeline = load_pipeline()
        print(json.dumps({"ready": True}), flush=True)
    except Exception as exc:
        print(json.dumps({"ready": False, "error": type(exc).__name__}), flush=True)
        raise
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            audio = synthesize(
                pipeline, request.get("text"), request.get("voiceId"), request.get("speed", 1),
            )
            response = {"id": request_id, "audio": base64.b64encode(audio).decode("ascii")}
        except Exception as exc:
            response = {"id": request_id, "error": type(exc).__name__}
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
