"""Check private service health without printing the authentication secret."""

import base64
import io
import json
from pathlib import Path
import sys
import urllib.request
import wave


def main() -> None:
    secret_file = Path(sys.argv[1])
    url = sys.argv[2]
    entries = dict(
        line.split("=", 1)
        for line in secret_file.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#") and "=" in line
    )
    secret = entries["CHATSCENE_VOICE_SERVICE_SECRET"].strip().strip('"').strip("'")
    if len(sys.argv) > 3 and sys.argv[3] == "--warm":
        warm_request = urllib.request.Request(
            url.replace("/health", "/warm"),
            data=b"{}",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(warm_request, timeout=10):
            pass
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {secret}"})
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.load(response)
    print(json.dumps({key: body.get(key) for key in (
        "installed", "modelVariant", "genericInstalled", "piperVoices", "kokoroVoices",
        "catalogVoices", "device", "modelLoaded", "warming"
    )}))
    if "--smoke-kokoro" in sys.argv[3:]:
        for voice in body.get("kokoroVoices", []):
            synth_request = urllib.request.Request(
                url.replace("/health", "/kokoro/synthesize"),
                data=json.dumps({
                    "text": "Hoje temos uma história nova.", "voice": voice, "speed": 1,
                }).encode("utf-8"),
                headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(synth_request, timeout=240) as response:
                result = json.load(response)
            audio = base64.b64decode(result["audio"], validate=True)
            with wave.open(io.BytesIO(audio), "rb") as wav:
                duration = wav.getnframes() / wav.getframerate()
            print(json.dumps({"voice": voice, "durationSec": round(duration, 2), "audioBytes": len(audio)}))
    if "--smoke-piper" in sys.argv[3:]:
        for voice in body.get("piperVoices", []):
            synth_request = urllib.request.Request(
                url.replace("/health", "/generic"),
                data=json.dumps({
                    "text": "Teste de voz local.", "voice": voice, "speed": 1,
                }).encode("utf-8"),
                headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(synth_request, timeout=60) as response:
                result = json.load(response)
            audio = base64.b64decode(result["audio"], validate=True)
            with wave.open(io.BytesIO(audio), "rb") as wav:
                duration = wav.getnframes() / wav.getframerate()
            print(json.dumps({"voice": voice, "durationSec": round(duration, 2), "audioBytes": len(audio)}))


if __name__ == "__main__":
    main()
