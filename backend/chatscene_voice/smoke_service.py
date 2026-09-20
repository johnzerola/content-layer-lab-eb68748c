"""End-to-end private voice smoke using a synthetic reference only."""

import base64
import json
from pathlib import Path
import sys
import urllib.request
import uuid


def main() -> None:
    secret_file = Path(sys.argv[1])
    endpoint = sys.argv[2]
    reference_file = Path(sys.argv[3])
    output_file = Path(sys.argv[4])
    entries = dict(
        line.split("=", 1)
        for line in secret_file.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#") and "=" in line
    )
    secret = entries["CHATSCENE_VOICE_SERVICE_SECRET"].strip().strip('"').strip("'")
    root = endpoint.rstrip("/")
    user_id = str(uuid.uuid4())
    reference_id = None

    def call(path: str, payload: dict, method: str = "POST") -> dict:
        request = urllib.request.Request(
            f"{root}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            method=method,
        )
        with urllib.request.urlopen(request, timeout=240) as response:
            return json.load(response)

    try:
        created = call("/v1/voice/references", {
            "userId": user_id,
            "audio": base64.b64encode(reference_file.read_bytes()).decode("ascii"),
        })
        reference_id = created["id"]
        result = call("/v1/voice/synthesize", {
            "userId": user_id,
            "referenceId": reference_id,
            "text": "Você não vai acreditar no que aconteceu hoje.",
        })
        audio = base64.b64decode(result["audio"], validate=True)
        output_file.write_bytes(audio)
        print(json.dumps({"device": result["device"], "bytes": len(audio)}))
    finally:
        if reference_id:
            call("/v1/voice/references", {"userId": user_id, "referenceId": reference_id}, "DELETE")


if __name__ == "__main__":
    main()
