#!/usr/bin/env bash
# =============================================================================
# CleanerIA — Build e push da imagem do worker Serverless RunPod
# Rode na VPS da Hostear (ou qualquer máquina com Docker instalado).
#
# Pré-requisitos:
#   - Docker instalado (o script instala automaticamente se faltar, em Ubuntu/Debian)
#   - Login em um registry: Docker Hub (padrão) ou GHCR
#
# Uso:
#   # Docker Hub (mais simples):
#   REGISTRY_USER=seu_usuario_dockerhub ./scripts/build-push-runpod.sh
#
#   # GHCR (GitHub Container Registry):
#   REGISTRY=ghcr.io REGISTRY_USER=seu_usuario_github ./scripts/build-push-runpod.sh
#
#   # Tag customizada:
#   REGISTRY_USER=seu_usuario TAG=v1.0.0 ./scripts/build-push-runpod.sh
#
# O script NÃO publica nada sem confirmação do login no registry.
# =============================================================================
set -euo pipefail

# Permite executar tanto da raiz do projeto quanto de dentro de backend/.
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${BACKEND_DIR}"

IMAGE_NAME="${IMAGE_NAME:-cleaneria-runpod}"
REGISTRY="${REGISTRY:-docker.io}"
REGISTRY_USER="${REGISTRY_USER:-}"
TAG="${TAG:-latest}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.runpod}"
REGISTRY_TOKEN="${REGISTRY_TOKEN:-${DOCKERHUB_TOKEN:-}}"

if [[ -z "${REGISTRY_USER}" ]]; then
  echo "ERRO: defina REGISTRY_USER (usuário do Docker Hub ou GitHub)."
  echo "Ex:  REGISTRY_USER=meuusuario ./scripts/build-push-runpod.sh"
  exit 1
fi

if [[ "${REGISTRY}" == "docker.io" ]]; then
  FULL_IMAGE="${REGISTRY_USER}/${IMAGE_NAME}:${TAG}"
else
  FULL_IMAGE="${REGISTRY}/${REGISTRY_USER}/${IMAGE_NAME}:${TAG}"
fi

echo "=============================================="
echo " CleanerIA — build & push do worker RunPod"
echo "=============================================="
echo " Imagem:   ${FULL_IMAGE}"
echo " Dockerfile: ${DOCKERFILE}"
echo ""

# --- 1) Garante Docker instalado -------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "[1/4] Docker não encontrado — instalando..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker instalado. Se der erro de permissão, rode: newgrp docker"
else
  echo "[1/4] Docker encontrado: $(docker --version)"
fi

# --- 2) Login no registry ---------------------------------------------------
echo ""
echo "[2/4] Login no registry ${REGISTRY} (vai pedir senha/token)..."
if [[ -n "${REGISTRY_TOKEN}" ]]; then
  if [[ "${REGISTRY}" == "docker.io" ]]; then
    printf '%s' "${REGISTRY_TOKEN}" | docker login -u "${REGISTRY_USER}" --password-stdin
  else
    printf '%s' "${REGISTRY_TOKEN}" | docker login "${REGISTRY}" -u "${REGISTRY_USER}" --password-stdin
  fi
elif [[ "${REGISTRY}" == "docker.io" ]]; then
  docker login -u "${REGISTRY_USER}"
else
  docker login "${REGISTRY}" -u "${REGISTRY_USER}"
fi

# --- 3) Build ---------------------------------------------------------------
echo ""
echo "[3/4] Buildando a imagem (pode levar 10-20 min na primeira vez)..."
docker build -f "${DOCKERFILE}" -t "${FULL_IMAGE}" .

# --- 4) Push ----------------------------------------------------------------
echo ""
echo "[4/4] Enviando para o registry..."
docker push "${FULL_IMAGE}"

echo ""
echo "=============================================="
echo " Pronto! Imagem publicada:"
echo "   ${FULL_IMAGE}"
echo ""
echo " Próximo passo (na interface da RunPod):"
echo "   1. Serverless > New Endpoint > Deploy from a Docker image"
echo "   2. Container image: ${FULL_IMAGE}"
echo "   3. GPU: RTX 4090 (24 GB), min workers 0, max workers 3"
echo "   4. Anexe um Network Volume montado em /runpod-volume"
echo "      com os pesos (ProPainter em /runpod-volume/models,"
echo "      DiffuEraser em /runpod-volume/max-models)"
echo "   5. Env vars do endpoint:"
echo "      CLEANER_WORKER_SECRET=<mesmo segredo do app>"
echo "   6. Copie o ENDPOINT ID e configure no VaiViral:"
echo "      RUNPOD_API_KEY e RUNPOD_ENDPOINT_ID"
echo "=============================================="
