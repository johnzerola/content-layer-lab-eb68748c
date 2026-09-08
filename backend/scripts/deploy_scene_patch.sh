#!/usr/bin/env bash
set -euo pipefail

# Explicit scope: existing Hostear CleanerIA only. No volumes or jobs removed.
release=/opt/cleaneria-scene-masks-20260907
service=/opt/cleaner-cpu
container=content-layer-lab-cleaner-cpu-worker
original=content-layer-lab-cleaner-worker-cpu:latest
backup=content-layer-lab-cleaner-worker-cpu:before-scene-masks-20260907
candidate=content-layer-lab-cleaner-worker-cpu:scene-masks-20260907
test -d "$release/app"
test -f "$release/docker-compose.scene.yml"
test -f "$service/docker-compose.cpu.yml"
test "$(realpath "$service")" = /opt/cleaner-cpu
test "$(realpath "$release")" = /opt/cleaneria-scene-masks-20260907

# Never overwrite the recovery image on a repeated execution.
if ! docker image inspect "$backup" >/dev/null 2>&1; then
    docker tag "$original" "$backup"
fi
if [ ! -f "$release/hostear-app-before.tar.gz" ]; then
    tar -czf "$release/hostear-app-before.tar.gz" -C "$service" app
fi
docker build --network none --build-arg "BASE_IMAGE=$backup" \
    -f "$release/Dockerfile.scene-patch" -t "$candidate" "$release"
docker run --rm --network none --entrypoint python "$candidate" -c \
    'from app.workers.tasks import _run_official_pipeline; from app.services.chunking import plan_chunks; assert len(plan_chunks(5,cuts=[2]))==2; print("CPU patch imports and scene planner OK")'

# Check immediately before restart: a queued state alone is not a process.
processes=$(docker top "$container" -eo pid,comm | tail -n +2 | awk '{print $2}')
unexpected=$(printf '%s\n' "$processes" | grep -Ev '^(tini|python|curl)$' || true)
python_count=$(printf '%s\n' "$processes" | grep -c '^python$' || true)
if [ -n "$unexpected" ] || [ "$python_count" -gt 1 ]; then
    echo 'Unexpected active processes: deployment deferred to preserve running work.'
    exit 3
fi
docker tag "$candidate" "$original"
# The existing deployment supplied some settings through its launching shell,
# not .env. Reuse only service settings from the live container, without logging
# them or replacing shell globals such as HOME/PATH.
while IFS= read -r setting; do
    case "$setting" in
        CLEANER_*=*|CORS_ORIGINS=*|PROPAINTER_*=*|DIFFUERASER_*=*|OCR_*=*|RAPIDOCR_*=*)
            export "$setting" ;;
    esac
done < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container")
cd "$service"
docker compose -p cleaner-cpu -f docker-compose.cpu.yml -f "$release/docker-compose.scene.yml" up -d --no-build worker
healthy=0
for attempt in $(seq 1 20); do
    if curl -fsS --max-time 15 https://cleaner-104-234-186-50.nip.io/v1/health \
        | python3 -c 'import json,sys; assert json.load(sys.stdin).get("pipeline_revision")=="scene-masks-v1"' >/dev/null 2>&1; then
        healthy=1
        break
    fi
    sleep 3
done
if [ "$healthy" != 1 ]; then
    docker tag "$backup" "$original"
    docker compose -p cleaner-cpu -f docker-compose.cpu.yml -f "$release/docker-compose.scene.yml" up -d --no-build worker
    echo 'Patch health failed; previous image restored.'
    exit 4
fi
cp -a "$release/app/." "$service/app/"
cp "$release/docker-compose.scene.yml" "$service/docker-compose.scene.yml"
echo 'Hostear scene-masks-v1 healthy; recovery image and source archive retained.'
