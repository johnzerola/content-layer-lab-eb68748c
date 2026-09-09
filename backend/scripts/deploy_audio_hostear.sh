#!/usr/bin/env bash
set -euo pipefail
release=/opt/cleaneria-audio-20260908
service=/opt/cleaner-cpu
container=content-layer-lab-cleaner-cpu-worker
original=content-layer-lab-cleaner-worker-cpu:latest
backup=content-layer-lab-cleaner-worker-cpu:before-audio-20260908
candidate=content-layer-lab-cleaner-worker-cpu:audio-demucs-20260908
test "$(realpath "$service")" = /opt/cleaner-cpu
test "$(realpath "$release")" = /opt/cleaneria-audio-20260908
test -f "$service/docker-compose.scene.yml"
test -f "$release/app/audio_separation.py"

if ! docker image inspect "$backup" >/dev/null 2>&1; then
    current=$(docker inspect --format '{{.Image}}' "$container")
    docker tag "$current" "$backup"
fi
if [ ! -f "$release/hostear-app-before.tar.gz" ]; then
    tar -czf "$release/hostear-app-before.tar.gz" -C "$service" app docker-compose.cpu.yml docker-compose.scene.yml
fi
docker build --build-arg "BASE_IMAGE=$backup" -f "$release/Dockerfile.audio-patch" -t "$candidate" "$release"
docker run --rm --network none --entrypoint python "$candidate" -c \
  'import demucs; from app.audio_separation import command; import torch; assert not torch.cuda.is_available(); print("Demucs audio adapter imports OK; CPU only")'

if [ "${1:-build}" != activate ]; then
    echo 'Candidate built; production unchanged. Preflight the model before activation.'
    exit 0
fi

# Stop before touching the service if an unexpected processing child is present.
processes=$(docker top "$container" -eo pid,comm | tail -n +2 | awk '{print $2}')
unexpected=$(printf '%s\n' "$processes" | grep -Ev '^(tini|python|curl)$' || true)
python_count=$(printf '%s\n' "$processes" | grep -c '^python$' || true)
if [ -n "$unexpected" ] || [ "$python_count" -gt 1 ]; then
    echo 'Active processing detected; deployment deferred.'
    exit 3
fi

# Preserve all actual live configuration, including secrets; never print it.
while IFS= read -r setting; do
    case "$setting" in
        CLEANER_*=*|CORS_ORIGINS=*|PROPAINTER_*=*|DIFFUERASER_*=*|OCR_*=*|RAPIDOCR_*=*) export "$setting" ;;
    esac
done < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container")
cd "$service"
compose=(docker compose -p cleaner-cpu -f docker-compose.cpu.yml -f docker-compose.scene.yml)
rollback() {
    docker tag "$backup" "$original"
    "${compose[@]}" up -d --no-build worker
    echo 'Audio deployment failed; previous worker image restored.'
}
trap rollback ERR
docker tag "$candidate" "$original"
"${compose[@]}" -f "$release/docker-compose.audio.yml" up -d --no-build worker
healthy=0
for attempt in $(seq 1 20); do
    if curl -fsS --max-time 5 https://cleaner-104-234-186-50.nip.io/v1/audio/capabilities \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["ready"] and d["device"]=="cpu"' >/dev/null 2>&1; then
        healthy=1
        break
    fi
    sleep 2
done
test "$healthy" = 1
curl -fsS --max-time 15 https://cleaner-104-234-186-50.nip.io/v1/health >/dev/null
cp "$release/app/audio_separation.py" "$release/app/main.py" "$release/app/storage.py" "$service/app/"
cp "$release/docker-compose.audio.yml" "$service/docker-compose.audio.yml"
trap - ERR
echo 'Hostear audio service ready. Prior image and sources preserved. RunPod untouched.'
