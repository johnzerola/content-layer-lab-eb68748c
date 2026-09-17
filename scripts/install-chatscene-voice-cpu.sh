#!/usr/bin/env bash
set -euo pipefail
# Run from the repository root on the Node server. No public inference port.
VOICE_ROOT="${1:-/opt/chatscene-voice}"
if command -v python3.11 >/dev/null 2>&1; then
  SYSTEM_PYTHON=python3.11
elif command -v python3.10 >/dev/null 2>&1; then
  SYSTEM_PYTHON=python3.10
else
  echo 'Python 3.10 or 3.11 is required.' >&2
  exit 2
fi
mkdir -p "$VOICE_ROOT"
if [[ ! -x "$VOICE_ROOT/.venv/bin/python" ]]; then
  "$SYSTEM_PYTHON" -m venv "$VOICE_ROOT/.venv"
fi
VOICE_PYTHON="$VOICE_ROOT/.venv/bin/python"
export HF_HOME="$VOICE_ROOT/cache/huggingface"
export TORCH_HOME="$VOICE_ROOT/cache/torch"
export NUMBA_CACHE_DIR="$VOICE_ROOT/cache/numba"
"$VOICE_PYTHON" -m pip install --upgrade pip
"$VOICE_PYTHON" -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
"$VOICE_PYTHON" -m pip install -r backend/chatscene_voice/requirements.txt
"$VOICE_PYTHON" backend/chatscene_voice/download.py --directory "$VOICE_ROOT/models"
"$VOICE_PYTHON" -c 'from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print("Runtime import OK")'
printf 'Configure CHATSCENE_VOICE_CONFIG with pythonPath=%s, modelPath=%s/models, storagePath=%s/references, device=cpu and ready=true.\n' "$VOICE_PYTHON" "$VOICE_ROOT" "$VOICE_ROOT"
