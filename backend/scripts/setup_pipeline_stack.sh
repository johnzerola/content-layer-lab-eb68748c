#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

APP_ORIGIN=${APP_ORIGIN:-http://localhost:5173}
CLEANER_PUBLIC_HOST=${CLEANER_PUBLIC_HOST:-localhost}
CLEANER_BIND_PORT=${CLEANER_BIND_PORT:-8095}
WITH_GPU=${WITH_GPU:-0}
INSTALL_GPU_MODELS=${INSTALL_GPU_MODELS:-$WITH_GPU}

die() {
  echo "[erro] $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || die "docker nao encontrado"
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin nao encontrado"

umask 077
SECRET=""
MINIO_SECRET=""
if [[ -f .env ]]; then
  SECRET=$(sed -n 's/^CLEANER_WORKER_SECRET=//p' .env | head -n1)
  MINIO_SECRET=$(sed -n 's/^MINIO_SECRET_KEY=//p' .env | head -n1)
fi
if [[ ${#SECRET} -lt 32 || "$SECRET" == "default_secret" ]]; then
  SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
fi
if [[ ${#MINIO_SECRET} -lt 32 ]]; then
  MINIO_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
fi

mkdir -p data/storage data/gpu-storage data/models data/max-models
chown -R 10001:10001 data/storage data/gpu-storage data/models data/max-models 2>/dev/null || true

cat > .env <<ENV
CLEANER_WORKER_SECRET=$SECRET
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
CLEANER_RATE_LIMIT_PER_MINUTE=${CLEANER_RATE_LIMIT_PER_MINUTE:-120}
CLEANER_TEXT_DETECTOR=${CLEANER_TEXT_DETECTOR:-PP-OCRv5_server_det}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-cleaneradmin}
MINIO_SECRET_KEY=$MINIO_SECRET
MINIO_BUCKET=${MINIO_BUCKET:-cleaner-jobs}
MINIO_API_PORT=${MINIO_API_PORT:-9000}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT:-9001}
PROPAINTER_MAX_SIDE=${PROPAINTER_MAX_SIDE:-1280}
DIFFUERASER_MAX_SIDE=${DIFFUERASER_MAX_SIDE:-960}
CLEANER_AUTO_DIFFUERASER=${CLEANER_AUTO_DIFFUERASER:-1}
ENV
chmod 600 .env

echo "[1/4] Build API/CPU"
docker compose -f docker-compose.pipeline.yml build api

if [[ "$WITH_GPU" == "1" ]]; then
  command -v nvidia-smi >/dev/null 2>&1 || die "nvidia-smi nao encontrado para WITH_GPU=1"
  docker info --format '{{json .Runtimes}}' | grep -q 'nvidia' || die "NVIDIA Container Toolkit nao configurado"
  echo "[2/4] Build GPU"
  docker compose -f docker-compose.pipeline.yml --profile gpu build worker-gpu
  if [[ "$INSTALL_GPU_MODELS" == "1" ]]; then
    echo "[3/4] Instalando modelos GPU"
    docker compose -f docker-compose.pipeline.yml --profile gpu run --rm --no-deps \
      -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
      worker-gpu python3.10 scripts/install_propainter.py --weights-only --weights-dir /app/models
    docker compose -f docker-compose.pipeline.yml --profile gpu run --rm --no-deps \
      -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_TOKEN="${HF_TOKEN:-}" \
      worker-gpu python3.10 scripts/install_diffueraser.py --models-only --models-root /app/max-models
  else
    echo "[3/4] INSTALL_GPU_MODELS=0; usando modelos existentes"
  fi
  echo "[4/4] Subindo pipeline completo com GPU local"
  docker compose -f docker-compose.pipeline.yml --profile gpu up -d
else
  echo "[2/4] GPU desativada neste host"
  echo "[3/4] Modelos GPU pulados"
  echo "[4/4] Subindo API + detect + Redis + MinIO"
  docker compose -f docker-compose.pipeline.yml up -d api worker-detect redis minio
fi

echo "[ok] API: http://127.0.0.1:${CLEANER_BIND_PORT}/v1/health"
echo "[ok] Segredo salvo em $ROOT_DIR/.env"
