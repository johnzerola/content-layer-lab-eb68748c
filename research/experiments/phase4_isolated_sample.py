"""Run one bounded RealBasicVSR sample on a disposable RunPod endpoint."""
import argparse
import base64
import hashlib
import hmac
import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend/scripts"))
from audit_runpod_costs import read_env

REST = "https://rest.runpod.io/v1"
HOST = "https://cleaner-104-234-186-50.nip.io"


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames",
        "-of", "json", str(path)], text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--image", required=True)
    parser.add_argument("--roi", type=int, nargs=4, required=True)
    parser.add_argument("--strength", type=float, default=.25)
    parser.add_argument("--window", type=int, default=3)
    parser.add_argument("--context", type=int, default=2)
    args = parser.parse_args()
    if not re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", args.image):
        raise ValueError("image must use an immutable sha256 digest")
    if args.output.exists():
        raise FileExistsError(args.output)
    info = probe(args.source)
    duration = float(info["format"]["duration"])
    if not 0 < duration <= 3.05:
        raise ValueError("phase-4 sample must be <=3 seconds")
    x, y, width, height = args.roi
    if min(x, y, width, height) < 0 or not width or not height or width * height > 700_000:
        raise ValueError("invalid or oversized ROI")

    values = read_env(Path(".env.local"))
    key, secret = values["RUNPOD_API_KEY"], values["CLEANER_WORKER_SECRET"]
    session = requests.Session()
    session.headers["Authorization"] = "Bearer " + key
    args.output.mkdir(parents=True, exist_ok=False)
    evidence = Path("research/benchmarks/runs") / ("phase4-isolated-" + str(time.time_ns()))
    evidence.mkdir(parents=True, exist_ok=False)
    report_path = evidence / "report.json"
    report = {"status": "preparing", "input": str(args.source), "output": str(args.output),
              "image": args.image, "roi": args.roi, "strength": args.strength,
              "window": args.window, "context": args.context,
              "duration": duration, "endpoint_id": None, "template_id": None,
              "provider_jobs": [], "cleanup_errors": []}
    owned_job = str(uuid.uuid4())

    def save():
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def call(method, url, **kwargs):
        response = session.request(method, url, timeout=(15, 45), **kwargs)
        if not response.ok:
            detail = re.sub(r"https?://\S+", "[URL]", response.text).replace(key, "[SECRET]")[:300]
            raise RuntimeError(f"RunPod {method} HTTP {response.status_code}: {detail}")
        return response.json() if response.content else {}

    def token(scope):
        value = f"v2.{owned_job}.{int(time.time()) + 1800}.{scope}"
        return value + "." + hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()

    def wait_job(api, payload, execution_seconds):
        reply = call("POST", api + "/run", json={"input": payload, "policy": {
            "executionTimeout": execution_seconds * 1000, "ttl": (execution_seconds + 900) * 1000}})
        job_id = reply["id"]
        report["provider_jobs"].append({"id": job_id, "action": payload.get("action", "restore")})
        save()
        deadline = time.monotonic() + execution_seconds + 900
        while time.monotonic() < deadline:
            status = call("GET", api + "/status/" + job_id)
            state = status.get("status")
            if state == "COMPLETED":
                report["provider_jobs"][-1].update(execution_ms=status.get("executionTime"), delay_ms=status.get("delayTime"))
                output = status.get("output") or {}
                if output.get("ok") is not True:
                    raise RuntimeError("worker returned ok=false")
                return output
            if state in ("FAILED", "CANCELLED", "TIMED_OUT"):
                raise RuntimeError("worker job " + str(state))
            time.sleep(4)
        raise TimeoutError("bounded RunPod deadline reached")

    try:
        original = call("GET", REST + "/endpoints/" + values["RUNPOD_ENDPOINT_ID"])
        source_template = call("GET", REST + "/templates/" + original["templateId"])
        suffix = uuid.uuid4().hex[:10]
        template = {"name": "cleaneria-phase4-isolated-" + suffix, "imageName": args.image,
                    "isServerless": True, "isPublic": False, "category": "NVIDIA",
                    # The image is about 5.7 GB compressed and 11.6 GB unpacked.
                    # Pull plus extraction can exceed a 20 GB worker disk.
                    "containerDiskInGb": 30, "volumeInGb": 0, "ports": [], "env": {}}
        if source_template.get("containerRegistryAuthId"):
            template["containerRegistryAuthId"] = source_template["containerRegistryAuthId"]
        report["template_id"] = call("POST", REST + "/templates", json=template)["id"]
        endpoint = {"name": "cleaneria-phase4-isolated-" + suffix,
                    "templateId": report["template_id"], "computeType": "GPU", "gpuCount": 1,
                    "gpuTypeIds": ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3090", "NVIDIA RTX A5000"],
                    "workersMin": 0, "workersMax": 1, "idleTimeout": 5,
                    "executionTimeoutMs": 720000, "scalerType": "QUEUE_DELAY", "scalerValue": 4}
        report["endpoint_id"] = call("POST", REST + "/endpoints", json=endpoint)["id"]
        api = "https://api.runpod.ai/v2/" + report["endpoint_id"]
        report["status"] = "uploading"
        save()
        with args.source.open("rb") as media:
            response = requests.post(HOST + f"/v1/jobs/{owned_job}/upload", data=media,
                headers={"x-job-token": token("upload"), "content-type": "video/mp4",
                         "x-file-name": "phase4-input.mp4", "x-file-size": str(args.source.stat().st_size)},
                timeout=(15, 240))
        if not response.ok:
            raise RuntimeError("Hostear upload failed HTTP " + str(response.status_code))
        for _ in range(60):
            response = session.get(api + "/health", timeout=(10, 30))
            if response.ok:
                break
            time.sleep(5)
        else:
            raise TimeoutError("queue API unavailable")
        report["status"] = "health"
        save()
        health = wait_job(api, {"action": "health"}, 90)
        report["health"] = health
        if not health.get("cuda") or not health.get("checkpoint") or health.get("phase") != 4:
            raise RuntimeError("phase-4 GPU capability check failed")
        report["status"] = "restoring"
        save()
        source_url = HOST + f"/v1/jobs/{owned_job}/source?token=" + token("result")
        output = wait_job(api, {"source_url": source_url, "roi": args.roi,
            "strength": args.strength, "window": args.window, "context": args.context}, 720)
        encoded = output.pop("output_b64", None)
        if not encoded:
            raise RuntimeError("worker returned no artifact")
        raw = base64.b64decode(encoded, validate=True)
        if hashlib.sha256(raw).hexdigest() != output.get("checksum"):
            raise RuntimeError("output checksum mismatch")
        candidate = args.output / "candidate.mp4"
        candidate.write_bytes(raw)
        result_info = probe(candidate)
        source_video = next(s for s in info["streams"] if s["codec_type"] == "video")
        result_video = next(s for s in result_info["streams"] if s["codec_type"] == "video")
        if any(source_video[k] != result_video[k] for k in ("width", "height", "r_frame_rate")):
            raise RuntimeError("geometry or FPS changed")
        if abs(float(result_info["format"]["duration"]) - duration) > .1:
            raise RuntimeError("duration changed")
        report.update(status="completed", result=output, final_probe=result_info, final_video=str(candidate))
    except Exception as exc:
        report.update(status="failed", error=str(exc)[:500])
    finally:
        endpoint_id = report.get("endpoint_id")
        if endpoint_id:
            api = "https://api.runpod.ai/v2/" + endpoint_id
            for job in report["provider_jobs"]:
                try:
                    call("POST", api + "/cancel/" + job["id"], json={})
                except Exception:
                    pass
            try:
                call("PATCH", REST + "/endpoints/" + endpoint_id, json={"workersMin": 0, "workersMax": 0})
                report["zero_capacity"] = True
            except Exception:
                report["cleanup_errors"].append("zero_capacity_not_confirmed")
            try:
                call("DELETE", REST + "/endpoints/" + endpoint_id)
                report["endpoint_deleted"] = True
            except Exception:
                report["cleanup_errors"].append("endpoint_delete_not_confirmed")
        if report.get("template_id"):
            try:
                call("DELETE", REST + "/templates/" + report["template_id"])
                report["template_deleted"] = True
            except Exception:
                report["cleanup_errors"].append("template_delete_not_confirmed")
        try:
            response = requests.delete(HOST + f"/v1/jobs/{owned_job}",
                headers={"x-job-token": token("control")}, timeout=(15, 40))
            report["hostear_project_deleted"] = response.ok
        except Exception:
            report["hostear_project_deleted"] = False
        save()
    print(json.dumps(report), flush=True)
    return int(report.get("status") != "completed" or bool(report["cleanup_errors"]) or not report.get("hostear_project_deleted"))


if __name__ == "__main__":
    raise SystemExit(main())
