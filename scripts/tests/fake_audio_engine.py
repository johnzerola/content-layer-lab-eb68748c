"""Test-only process used to exercise the AUD-00 runner lifecycle."""
from __future__ import annotations

from pathlib import Path
import shutil
import sys
import time
import wave


mode, source_arg, output_arg, model = sys.argv[1:5]
source = Path(source_arg)
root = Path(output_arg) / model / source.stem

if mode == "failure":
    raise SystemExit(7)
if mode == "timeout":
    time.sleep(30)
    raise SystemExit(0)
if mode == "missing":
    raise SystemExit(0)

root.mkdir(parents=True)
if mode == "valid":
    shutil.copyfile(source, root / "vocals.wav")
    shutil.copyfile(source, root / "no_vocals.wav")
elif mode == "bad-rate":
    with wave.open(str(source), "rb") as reader:
        params = reader.getparams()
        frames = reader.readframes(params.nframes)
    for name in ("vocals.wav", "no_vocals.wav"):
        with wave.open(str(root / name), "wb") as writer:
            writer.setnchannels(params.nchannels)
            writer.setsampwidth(params.sampwidth)
            writer.setframerate(params.framerate // 2)
            writer.writeframes(frames)
else:
    raise SystemExit(8)
