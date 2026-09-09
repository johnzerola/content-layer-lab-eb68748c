"""Run one five-second fixture inside the candidate image before activation."""
from pathlib import Path
import json
import threading
import time

from app.audio_separation import audio_info, separate

directory = Path('/audio-test')
assert 0 < audio_info(directory / 'input.wav') <= 5.1
started = time.monotonic()
try:
    duration = separate(directory, threading.Event())
except Exception:
    print((directory / 'engine.log').read_text()[-5000:], flush=True)
    raise
print(json.dumps({'duration': duration, 'elapsed_seconds': round(time.monotonic() - started, 2),
                  'engine': 'demucs', 'device': 'cpu'}), flush=True)
