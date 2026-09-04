#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

REDIS_URL=${REDIS_URL:?defina REDIS_URL, ex: redis://user:senha@10.0.0.5:6379/0}
MINIO_ENDPOINT=${MINIO_ENDPOINT:?defina MINIO_ENDPOINT, ex: https://minio.example.com}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:?defina MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:?defina MINIO_SECRET_KEY}
CLEANER_WORKER_SECRET=${CLEANER_WORKER_SECRET:?defina CLEANER_WORKER_SECRET igual ao da VPS CPU}
MIN_VRAM_MB=${DIFFUERASER_MIN_VRAM_MB:-20000}
INSTALL_MODELS=${INSTALL_MODELS:-1}

die() {
  echo "[erro] $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || die "docker nao encontrado"
command -v nvidia-smi >/dev/null 2>&1 || die "nvidia-smi nao encontrado"
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin nao encontrado"
docker info --format '{{json .Runtimes}}' | grep -q 'nvidia' || die "NVIDIA Container Toolkit nao configurado"

VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | sort -nr | head -n1 | tr -d ' ')
[[ "$VRAM_MB" =~ ^[0-9]+$ ]] || die "nao foi possivel ler a VRAM"
if (( VRAM_MB < MIN_VRAM_MB )); then
  die "GPU com ${VRAM_MB} MiB; ajuste DIFFUERASER_MIN_VRAM_MB ou use GPU maior"
fi

mkdir -p data/gpu-storage data/models data/max-models
chown -R 10001:10001 data/gpu-storage data/models data/max-models 2>/dev/null || true

umask 077
cat > .env <<ENV
CLEANER_WORKER_SECRET=$CLEANER_WORKER_SECRET
REDIS_URL=$REDIS_URL
MINIO_ENDPOINT=$MINIO_ENDPOINT
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET=${MINIO_BUCKET:-cleaner-jobs}
MINIO_SECURE=${MINIO_SECURE:-1}
CORS_ORIGINS=${CORS_ORIGINS:-https://localhost}
CLEANER_CALLBACK_ORIGINS=${CLEANER_CALLBACK_ORIGINS:-https://localhost}
CLEANER_ALLOWED_HOSTS=${CLEANER_ALLOWED_HOSTS:-localhost,127.0.0.1}
PROPAINTER_MAX_SIDE=${PROPAINTER_MAX_SIDE:-1280}
DIFFUERASER_MAX_SIDE=${DIFFUERASER_MAX_SIDE:-960}
CLEANER_AUTO_DIFFUERASER=${CLEANER_AUTO_DIFFUERASER:-1}
ENV
chmod 600 .env

echo "[1/3] Build GPU worker"
docker compose -f docker-compose.gpu-worker.yml build

if [[ "$INSTALL_MODELS" == "1" ]]; then
  echo "[2/3] Instalando modelos oficiais"
  docker compose -f docker-compose.gpu-worker.yml run --rm --no-deps \
    -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
    worker-gpu python3.10 scripts/install_propainter.py --weights-only --weights-dir /app/models
  docker compose -f docker-compose.gpu-worker.yml run --rm --no-deps \
    -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
    worker-gpu python3.10 scripts/install_diffueraser.py --models-only --models-root /app/max-models
else
  echo "[2/3] INSTALL_MODELS=0; usando modelos existentes"
fi

echo "[3/3] Subindo worker GPU conectado a Redis/MinIO externos"
docker compose -f docker-compose.gpu-worker.yml up -d
echo "[ok] worker GPU pronto para filas gpu-quality,gpu-max"
