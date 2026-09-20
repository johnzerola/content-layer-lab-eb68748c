#!/usr/bin/env bash
set -euo pipefail

root=/opt/chatscene-voice
if [[ ! -f "$root/kokoro_worker.py" || ! -f "$root/download_kokoro_ptbr.py" || ! -f "$root/smoke_kokoro.py" ]]; then
  echo "Copie os três scripts Kokoro para $root antes da instalação." >&2
  exit 1
fi

mkdir -p "$root/kokoro"
rm -f "$root/kokoro/runtime-ready"
if ! command -v espeak-ng >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y espeak-ng
fi

if [[ ! -x "$root/kokoro-venv/bin/python" ]]; then
  python3 -m venv "$root/kokoro-venv"
fi
# Debian may create a symlinked venv interpreter that resolves back to the
# system binary and ignores pyvenv.cfg. Keep a copied interpreter so the
# isolated site-packages are actually used by the service.
cp -f "$(command -v python3)" "$root/kokoro-venv/bin/python-native"
chmod 755 "$root/kokoro-venv/bin/python-native"
"$root/kokoro-venv/bin/python-native" -m pip install --upgrade pip
"$root/kokoro-venv/bin/python-native" -m pip install 'torch==2.6.0' --index-url https://download.pytorch.org/whl/cpu
"$root/kokoro-venv/bin/python-native" -m pip install 'kokoro==0.9.4' 'numpy<3' 'huggingface_hub<1'
"$root/kokoro-venv/bin/python-native" "$root/download_kokoro_ptbr.py"
"$root/kokoro-venv/bin/python-native" "$root/smoke_kokoro.py"
touch "$root/kokoro/runtime-ready"
echo "Kokoro PT-BR pronto: pf_dora, pm_alex, pm_santa. Reinicie chatscene-voice para ativar."
