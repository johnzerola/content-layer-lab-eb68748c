"""Offline smoke test: all three Kokoro identities must produce non-silent PT-BR WAV."""

import base64
import json
import math
import os
from pathlib import Path
import select
import subprocess
import sys
import wave
import io


ROOT = Path(os.environ.get("CHATSCENE_VOICE_ROOT", "/opt/chatscene-voice"))
PYTHON = Path(os.environ.get("CHATSCENE_KOKORO_PYTHON", str(ROOT / "kokoro-venv" / "bin" / "python")))
WORKER = ROOT / "kokoro_worker.py"
VOICES = ("pf_dora", "pm_alex", "pm_santa")


def response(process, timeout):
    if not select.select([process.stdout], [], [], timeout)[0]:
        raise TimeoutError("O motor Kokoro não respondeu ao teste.")
    line = process.stdout.readline()
    if not line:
        raise RuntimeError("O motor Kokoro terminou durante o teste.")
    return json.loads(line)


def main():
    env = os.environ.copy()
    env["HF_HUB_OFFLINE"] = "1"
    env["CHATSCENE_KOKORO_MODEL_DIR"] = str(ROOT / "kokoro")
    process = subprocess.Popen(
        [str(PYTHON), "-u", str(WORKER)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, env=env,
    )
    try:
        if not response(process, 120).get("ready"):
            raise RuntimeError("O motor Kokoro não ficou pronto.")
        for voice in VOICES:
            process.stdin.write(json.dumps({
                "id": voice, "text": "Oi, tudo bem? Tenho uma história para contar.",
                "voiceId": voice, "speed": 1,
            }, ensure_ascii=False) + "\n")
            process.stdin.flush()
            result = response(process, 120)
            if result.get("id") != voice or not result.get("audio"):
                raise RuntimeError(f"A voz {voice} não produziu áudio.")
            audio = base64.b64decode(result["audio"], validate=True)
            with wave.open(io.BytesIO(audio)) as wav:
                duration = wav.getnframes() / wav.getframerate()
                peak = max(abs(x) for x in __import__("array").array("h", wav.readframes(wav.getnframes())))
                if wav.getnchannels() != 1 or wav.getframerate() != 24000:
                    raise RuntimeError(f"Formato de áudio inesperado em {voice}.")
            if not math.isfinite(duration) or not 0.3 < duration < 30 or peak < 100:
                raise RuntimeError(f"Áudio inválido ou silencioso em {voice}.")
            print(f"{voice}: WAV {duration:.1f}s, pico {peak}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
