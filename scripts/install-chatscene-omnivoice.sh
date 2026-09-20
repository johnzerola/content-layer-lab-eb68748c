#!/usr/bin/env bash
set -euo pipefail

# Stages the optional OmniVoice runtime. It never downloads model weights.
# Usage: bash scripts/install-chatscene-omnivoice.sh /opt/chatscene-voice /private/licensed-checkpoint /private/commercial-grant.pdf
VOICE_ROOT="${1:?Informe a pasta do serviço de voz}"
CHECKPOINT="${2:?Informe a pasta do checkpoint licenciado}"
GRANT_FILE="${3:?Informe o documento privado de autorização comercial}"

if [[ ! -d "$CHECKPOINT" || ! -f "$GRANT_FILE" ]]; then
  echo 'Checkpoint local e documento da licença comercial são obrigatórios.' >&2
  exit 2
fi
if ! command -v python3.11 >/dev/null 2>&1; then
  echo 'Python 3.11 é necessário para este runtime isolado.' >&2
  exit 2
fi

mkdir -p "$VOICE_ROOT/omnivoice/catalog"
python3.11 -m venv "$VOICE_ROOT/omnivoice-venv"
VOICE_PYTHON="$VOICE_ROOT/omnivoice-venv/bin/python"
"$VOICE_PYTHON" -m pip install --upgrade pip
"$VOICE_PYTHON" -m pip install 'torch==2.8.0' 'torchaudio==2.8.0' --index-url https://download.pytorch.org/whl/cpu
"$VOICE_PYTHON" -m pip install 'omnivoice==0.2.1'
"$VOICE_PYTHON" -c 'from omnivoice import OmniVoice; print("Runtime OmniVoice importado")'

install -m 0644 backend/chatscene_voice/omnivoice_catalog.py "$VOICE_ROOT/omnivoice_catalog.py"
install -m 0644 backend/chatscene_voice/omnivoice_catalog.json "$VOICE_ROOT/omnivoice_catalog.json"
install -m 0644 backend/chatscene_voice/omnivoice_worker.py "$VOICE_ROOT/omnivoice_worker.py"
install -m 0644 backend/chatscene_voice/service.py "$VOICE_ROOT/service.py"
touch "$VOICE_ROOT/omnivoice/runtime-ready"

printf 'Runtime preparado. Configure CHATSCENE_OMNIVOICE_MODEL_PATH=%s\n' "$CHECKPOINT"
printf 'Revise a licença privada antes de produzir ou publicar amostras. Nenhuma voz foi aprovada automaticamente.\n'
