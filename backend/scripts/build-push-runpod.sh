#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

REGISTRY_USER=${REGISTRY_USER:-}
IMAGE_NAME=${IMAGE_NAME:-cleaneria-runpod}
IMAGE_TAG=${IMAGE_TAG:-latest}
PLATFORM=${PLATFORM:-linux/amd64}
DOCKERHUB_TOKEN=${DOCKERHUB_TOKEN:-}

die() {
  echo "[erro] $*" >&2
  exit 1
}

[[ -n "$REGISTRY_USER" ]] || die "use REGISTRY_USER=seu_usuario_dockerhub $0"
[[ "$REGISTRY_USER" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "REGISTRY_USER invalido"
[[ "$IMAGE_NAME" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || die "IMAGE_NAME invalido"
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "IMAGE_TAG invalida"

SUDO=()
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "sudo nao encontrado; execute como root"
  SUDO=(sudo)
fi

if ! command -v docker >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || die "instalacao automatica requer Ubuntu/Debian (apt-get)"
  echo "[1/4] Docker nao encontrado; instalando pelo repositorio oficial"
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y ca-certificates curl
  "${SUDO[@]}" install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | \
    "${SUDO[@]}" tee /etc/apt/keyrings/docker.asc >/dev/null
  "${SUDO[@]}" chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  ARCH=$(dpkg --print-architecture)
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" | \
    "${SUDO[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "[1/4] Docker ja instalado"
fi

if ! docker info >/dev/null 2>&1; then
  "${SUDO[@]}" systemctl enable --now docker 2>/dev/null || true
fi

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  DOCKER=("${SUDO[@]}" docker)
  "${DOCKER[@]}" info >/dev/null 2>&1 || die "daemon Docker indisponivel"
fi

echo "[2/4] Login no Docker Hub"
if [[ -n "$DOCKERHUB_TOKEN" ]]; then
  printf '%s' "$DOCKERHUB_TOKEN" | "${DOCKER[@]}" login --username "$REGISTRY_USER" --password-stdin
else
  "${DOCKER[@]}" login --username "$REGISTRY_USER"
fi

IMAGE="docker.io/${REGISTRY_USER}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "[3/4] Construindo $IMAGE para $PLATFORM"
"${DOCKER[@]}" build --platform "$PLATFORM" --file Dockerfile.gpu --tag "$IMAGE" .

echo "[4/4] Enviando imagem"
"${DOCKER[@]}" push "$IMAGE"

cat <<EOF

[ok] Imagem publicada: $IMAGE

Proximos passos:
  1. RunPod > Serverless > New Endpoint > Import from Docker Registry.
  2. Use a imagem acima e selecione Endpoint Type: Load Balancer.
  3. Escolha NVIDIA GeForce RTX 4090, exponha a porta 8000 e defina
     PORT=8000 e PORT_HEALTH=8000.
  4. Anexe o Network Volume com os pesos e siga DEPLOY-RUNPOD.md.
  5. No app, configure RUNPOD_API_KEY e RUNPOD_ENDPOINT_ID.
EOF
