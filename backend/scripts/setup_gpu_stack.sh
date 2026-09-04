#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

APP_ORIGIN=${APP_ORIGIN:-http://localhost:5173}
CLEANER_PUBLIC_HOST=${CLEANER_PUBLIC_HOST:-localhost}
CLEANER_BIND_PORT=${CLEANER_BIND_PORT:-8096}
CLEANER_WORKER_SECRET=${CLEANER_WORKER_SECRET:-}
MIN_VRAM_MB=${DIFFUERASER_MIN_VRAM_MB:-20000}
INSTALL_MODELS=${INSTALL_MODELS:-1}
START_STACK=${START_STACK:-1}
WAIT_READY=${WAIT_READY:-1}
REQUIRE_MAX_READY=${REQUIRE_MAX_READY:-1}

die() {
  echo "[erro] $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 nao encontrado"
}

[[ "$CLEANER_BIND_PORT" =~ ^[0-9]+$ ]] || die "CLEANER_BIND_PORT invalida"
[[ "$MIN_VRAM_MB" =~ ^[0-9]+$ ]] || die "DIFFUERASER_MIN_VRAM_MB invalida"

need_command docker
need_command nvidia-smi
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin nao encontrado"
docker info --format '{{json .Runtimes}}' | grep -q 'nvidia' || \
  die "NVIDIA Container Toolkit nao esta configurado no Docker"

VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | sort -nr | head -n1 | tr -d ' ')
[[ "$VRAM_MB" =~ ^[0-9]+$ ]] || die "nao foi possivel ler a VRAM"
if (( VRAM_MB < MIN_VRAM_MB )); then
  die "GPU com ${VRAM_MB} MiB; ajuste DIFFUERASER_MIN_VRAM_MB ou use GPU maior para DiffuEraser"
fi

AVAILABLE_KB=$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')
if (( AVAILABLE_KB < 70 * 1024 * 1024 )); then
  die "sao necessarios ao menos 70 GB livres para imagem, modelos e temporarios"
fi

umask 077
if [[ -f .env && -z "$CLEANER_WORKER_SECRET" ]]; then
  CLEANER_WORKER_SECRET=$(sed -n 's/^CLEANER_WORKER_SECRET=//p' .env | head -n1)
fi
if [[ ${#CLEANER_WORKER_SECRET} -lt 32 || "$CLEANER_WORKER_SECRET" == "default_secret" ]]; then
  CLEANER_WORKER_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
fi

mkdir -p data/storage data/models data/max-models
chown -R 10001:10001 data/storage data/models data/max-models 2>/dev/null || true
cat > .env <<ENV
CLEANER_ENV=production
CLEANER_WORKER_SECRET=$CLEANER_WORKER_SECRET
CORS_ORIGINS=$APP_ORIGIN
CLEANER_CALLBACK_ORIGINS=$APP_ORIGIN
CLEANER_ALLOWED_HOSTS=$CLEANER_PUBLIC_HOST,localhost,127.0.0.1
CLEANER_BIND_PORT=$CLEANER_BIND_PORT
CLEANER_MAX_UPLOAD_GB=${CLEANER_MAX_UPLOAD_GB:-2}
CLEANER_MAX_DURATION_SECONDS=${CLEANER_MAX_DURATION_SECONDS:-3600}
CLEANER_MAX_WIDTH=${CLEANER_MAX_WIDTH:-3840}
CLEANER_MAX_HEIGHT=${CLEANER_MAX_HEIGHT:-2160}
CLEANER_MAX_FPS=${CLEANER_MAX_FPS:-60}
CLEANER_STORAGE_QUOTA_GB=${CLEANER_STORAGE_QUOTA_GB:-100}
CLEANER_MIN_FREE_GB=${CLEANER_MIN_FREE_GB:-20}
CLEANER_RETENTION_HOURS=${CLEANER_RETENTION_HOURS:-72}
CLEANER_MAX_CONCURRENT_JOBS=1
CLEANER_RATE_LIMIT_PER_MINUTE=${CLEANER_RATE_LIMIT_PER_MINUTE:-120}
CLEANER_ALLOW_CLASSIC_FALLBACK=0
CLEANER_TEXT_DETECTOR=${CLEANER_TEXT_DETECTOR:-PP-OCRv5_server_det}
CLEANER_OCR_DEVICE=cpu
USE_CELERY=0
PROPAINTER_ROOT=/opt/ProPainter
PROPAINTER_WEIGHTS_DIR=/app/models
PROPAINTER_MAX_SIDE=${PROPAINTER_MAX_SIDE:-1280}
PROPAINTER_FP16=1
DIFFUERASER_ROOT=/opt/DiffuEraser
DIFFUERASER_MODELS_ROOT=/app/max-models
DIFFUERASER_MAX_SIDE=${DIFFUERASER_MAX_SIDE:-960}
ENV
chmod 600 .env

echo "[1/5] Build da imagem GPU"
docker compose -f docker-compose.gpu.yml build

if [[ "$INSTALL_MODELS" == "1" ]]; then
  echo "[2/5] Instalando pesos ProPainter em data/models"
  docker compose -f docker-compose.gpu.yml run --rm --no-deps \
    -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
    worker python3.10 scripts/install_propainter.py --weights-only --weights-dir /app/models

  echo "[3/5] Instalando modelos DiffuEraser em data/max-models"
  docker compose -f docker-compose.gpu.yml run --rm --no-deps \
    -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
    worker python3.10 scripts/install_diffueraser.py --models-only --models-root /app/max-models
else
  echo "[2/5] INSTALL_MODELS=0; pulando download dos modelos"
  echo "[3/5] INSTALL_MODELS=0; usando modelos ja existentes"
fi

if [[ "$START_STACK" == "1" ]]; then
  echo "[4/5] Subindo worker GPU"
  docker compose -f docker-compose.gpu.yml up -d
else
  echo "[4/5] START_STACK=0; stack nao iniciada"
fi

if [[ "$WAIT_READY" == "1" && "$START_STACK" == "1" ]]; then
  echo "[5/5] Validando /v1/health"
  ready=0
  for _ in $(seq 1 160); do
    body=$(curl -fsS "http://127.0.0.1:${CLEANER_BIND_PORT}/v1/health" 2>/dev/null || true)
    if grep -q '"online":true' <<<"$body" && grep -q '"ai_ready":true' <<<"$body"; then
      if [[ "$REQUIRE_MAX_READY" != "1" ]] || grep -q '"max_ready":true' <<<"$body"; then
        ready=1
        echo "$body"
        break
      fi
    fi
    sleep 3
  done
  if [[ "$ready" != "1" ]]; then
    docker compose -f docker-compose.gpu.yml logs --tail 160
    die "worker GPU nao ficou pronto dentro do tempo esperado"
  fi
else
  echo "[5/5] Validacao pulada"
fi

echo "[ok] CleanerIA GPU pronto em http://127.0.0.1:${CLEANER_BIND_PORT}/v1/health"
echo "[ok] Segredo salvo em $ROOT_DIR/.env"
