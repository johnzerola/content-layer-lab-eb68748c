"""Deploy the already-built ROI image on the existing Hostear worker, with rollback.

Run on Hostear as an administrator. Reuses live service settings privately and
keeps the existing compose overlays, mounts, audio service and recovery image.
"""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

CONTAINER = "content-layer-lab-cleaner-cpu-worker"
REVISION = "scene-roi-v3"  # Must match the candidate health response before activation.
CANDIDATE = "content-layer-lab-cleaner-worker-cpu:scene-roi-v3-20260909"
BACKUP = "content-layer-lab-cleaner-worker-cpu:before-roi-v3-20260909"
RELEASE = Path("/opt/cleaneria-scene-roi-v3-20260909")
SERVICE = Path("/opt/cleaner-cpu")


def run(*args, **kwargs):
    return subprocess.check_output(list(args), **kwargs).decode()


def main():
    assert SERVICE.resolve() == SERVICE and RELEASE.resolve() == RELEASE
    current = json.loads(run("docker", "inspect", CONTAINER))[0]
    labels = current["Config"]["Labels"]
    configs = labels["com.docker.compose.project.config_files"].split(",")
    overlay = SERVICE / "docker-compose.roi-v3.yml"
    if str(overlay) in configs:
        raise RuntimeError("ROI overlay already active; inspect before redeploying")
    if not all(Path(path).is_file() for path in configs):
        raise RuntimeError("existing compose file missing")
    # OCR can be running in a thread inside the main Python process. A process
    # list alone cannot establish that the media worker is idle.
    marker_count = int(run("docker", "exec", CONTAINER, "python", "-c",
        "from pathlib import Path; import os; "
        "print(sum(1 for p in Path(os.getenv('CLEANER_STORAGE', '/app/storage')).rglob('.processing')))"))
    if marker_count:
        raise RuntimeError("worker has processing markers; deploy deferred")
    processes = [line.split()[-1] for line in run("docker", "top", CONTAINER, "-eo", "pid,comm").splitlines()[1:]]
    if any(name.strip() not in {"tini", "python", "curl"} for name in processes) or processes.count("python") > 1:
        raise RuntimeError("worker has active child processes; deploy deferred")
    run("docker", "image", "inspect", CANDIDATE)
    if subprocess.run(["docker", "image", "inspect", BACKUP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run("docker", "tag", current["Image"], BACKUP)
    env = os.environ.copy()
    for entry in current["Config"]["Env"]:
        name, value = entry.split("=", 1)
        if name.startswith(("CLEANER_", "PROPAINTER_", "DIFFUERASER_", "AUDIO_", "OCR_", "RAPIDOCR_")) or name in {"CORS_ORIGINS", "USE_CELERY", "REDIS_URL"}:
            env[name] = value
    command = ["docker", "compose", "-p", labels["com.docker.compose.project"]]
    for path in configs:
        command += ["-f", path]
    overlay.write_text("services:\n  worker:\n    image: " + CANDIDATE + "\n", encoding="utf-8")
    try:
        subprocess.run(command + ["-f", str(overlay), "up", "-d", "--no-build", "worker"], env=env, cwd=SERVICE, check=True)
        healthy = False
        for _ in range(15):
            try:
                with urllib.request.urlopen("https://cleaner-104-234-186-50.nip.io/v1/health", timeout=15) as response:
                    data = json.load(response)
                    if data.get("pipeline_revision") == REVISION:
                        healthy = True
                        break
            except Exception:
                pass
            time.sleep(2)
        if not healthy:
            raise RuntimeError("new worker failed health check")
    except Exception:
        rollback = RELEASE / "docker-compose.rollback.yml"
        rollback.write_text("services:\n  worker:\n    image: " + BACKUP + "\n", encoding="utf-8")
        subprocess.run(command + ["-f", str(rollback), "up", "-d", "--no-build", "worker"], env=env, cwd=SERVICE, check=True)
        raise
    report = {"revision": REVISION, "image": CANDIDATE, "backup": BACKUP,
              "preserved_compose_files": configs, "overlay": str(overlay)}
    (RELEASE / "deployment.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == "__main__":
    main()
