"""Generate one short clip through the authenticated ChatScene GPU relay."""
import argparse
import base64
import json
from pathlib import Path
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:18096")
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--text", default="Esta voz foi gerada com segurança pela placa de vídeo local.")
    args = parser.parse_args()

    token = Path(args.token_file).read_text(encoding="utf-8").strip()
    reference = Path(args.reference).read_bytes()
    payload = json.dumps({
        "text": args.text,
        "referenceAudio": base64.b64encode(reference).decode("ascii"),
    }, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{args.url.rstrip('/')}/synthesize",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=300) as response:
        result = json.load(response)
    audio = base64.b64decode(result.pop("audio"), validate=True)
    Path(args.output).write_bytes(audio)
    result["audioBytes"] = len(audio)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
