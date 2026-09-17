"""Generate one synthetic-reference sample through the real stdio worker."""
import base64
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
runtime = Path(sys.argv[1]).resolve()
reference = Path(sys.argv[2]).resolve()
output = Path(sys.argv[3]).resolve()
process = subprocess.Popen(
    [sys.executable, "-u", str(root / "worker.py"), str(runtime)],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
)
try:
    ready = json.loads(process.stdout.readline())
    if not ready.get("ready"):
        raise RuntimeError(ready.get("error", "worker did not become ready"))
    request = {
        "id": "synthetic-smoke",
        "text": "Você não vai acreditar no que aconteceu hoje.",
        "referencePath": str(reference),
    }
    process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
    process.stdin.flush()
    result = json.loads(process.stdout.readline())
    if result.get("error"):
        raise RuntimeError(result["error"])
    audio = base64.b64decode(result["audio"], validate=True)
    output.write_bytes(audio)
    print(json.dumps({
        "device": result["device"],
        "durationSec": result["durationSec"],
        "processingMs": result["processingMs"],
        "bytes": len(audio),
    }))
finally:
    process.terminate()
    process.wait(timeout=30)
