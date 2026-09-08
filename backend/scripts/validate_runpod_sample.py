"""One bounded real Hostear -> RunPod -> Hostear validation. No automatic retries.

Secrets are supplied through process environment, never CLI arguments or reports.
Always caps this endpoint to zero workers on exit; does not delete volumes.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
from pathlib import Path
import subprocess
import time
import uuid

import requests

ENDPOINT = "km860ju9ded2e0"
IMAGE = "docker.io/nivaldo12/leaneria-runpod@sha256:df9b6633b6941491b7fb57391923b436396c24a463fe7f29684784947f3fe243"
REST = "https://rest.runpod.io/v1"
API = f"https://api.runpod.ai/v2/{ENDPOINT}"
HOST = "https://cleaner-104-234-186-50.nip.io"


def log(message):
    print(message, flush=True)


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames",
        "-of", "json", str(path)], text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reuse-template", help="Explicit existing template ID after configuration review")
    parser.add_argument("--prepared-report", type=Path, help="Reuse this exact sample's verified Hostear upload/masks")
    args = parser.parse_args()
    info = probe(args.source)
    duration = float(info["format"]["duration"])
    if not 0 < duration <= 5.05:
        raise ValueError("Only a <=5 second sample is allowed")
    key = os.environ["RUNPOD_API_KEY"]
    secret = os.environ["CLEANER_WORKER_SECRET"]
    if os.environ.get("RUNPOD_ENDPOINT_ID") != ENDPOINT:
        raise ValueError("Unexpected endpoint")
    args.output.mkdir(parents=True, exist_ok=False)
    report = {"input": str(args.source), "duration": duration, "jobs": []}
    report_file = args.output / "report.json"
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    pending = set()
    managed = False

    def save():
        report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=(15, 40), **kwargs)
        if not response.ok:
            detail = re.sub(r"https?://\S+", "[URL]", response.text).replace(key, "[SECRET]").replace(secret, "[SECRET]")[:300]
            raise RuntimeError(f"RunPod {method} {url.split('?')[0]} HTTP {response.status_code}: {detail}")
        return response.json()

    def token(job, scope):
        value = f"v2.{job}.{int(time.time()) + 1800}.{scope}"
        return value + "." + hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()

    def cpu(method, job, route, **kwargs):
        headers = kwargs.pop("headers", {})
        headers["x-job-token"] = token(job, "upload" if route == "upload" else "control")
        response = requests.request(method, f"{HOST}/v1/jobs/{job}/{route}",
                                    headers=headers, timeout=(15, 240), **kwargs)
        if not response.ok:
            raise RuntimeError(f"Hostear {route} HTTP {response.status_code}")
        return response.json()

    def signed(job, route):
        return f"{HOST}/v1/jobs/{job}/{route}?token={token(job, 'result')}"

    def run(payload, seconds):
        reply = api("POST", API + "/run", json={"input": payload,
            "policy": {"executionTimeout": seconds * 1000, "ttl": (seconds + 180) * 1000}})
        job = reply["id"]
        pending.add(job)
        report["jobs"].append({"id": job, "action": payload.get("action", "inpaint")})
        save()
        deadline = time.monotonic() + seconds + 180
        last = 0
        while time.monotonic() < deadline:
            status = api("GET", API + f"/status/{job}")
            state = status.get("status")
            if time.monotonic() - last > 20:
                log(f"RunPod {payload.get('action', 'inpaint')}: {state}")
                last = time.monotonic()
            if state == "COMPLETED":
                pending.remove(job)
                output = status.get("output", {})
                if not isinstance(output, dict) or output.get("ok") is not True:
                    # Don't expose arbitrary upstream errors that can contain signed URLs.
                    report["provider_failure"] = "Pipeline returned ok=false"
                    raise RuntimeError("Worker completed without a successful result")
                return output
            if state in ("FAILED", "CANCELLED", "TIMED_OUT"):
                pending.remove(job)
                report["provider_failure"] = str(state)
                raise RuntimeError(f"Worker {state}")
            time.sleep(3)
        raise RuntimeError("Bounded sample deadline reached")

    try:
        health = api("GET", API + "/health")
        if health["jobs"].get("inProgress", 0) or health["jobs"].get("inQueue", 0):
            raise RuntimeError("Other jobs exist; not changing their endpoint")
        old = api("GET", REST + f"/endpoints/{ENDPOINT}")
        report["previous"] = {k: old.get(k) for k in ("templateId", "workersMin", "workersMax", "idleTimeout")}
        query = "query { myself { endpoints { id template { id name imageName containerDiskInGb volumeInGb dockerArgs containerRegistryAuthId env { key value } } } } }"
        data = api("POST", "https://api.runpod.io/graphql", json={"query": query})
        if data.get("errors"):
            raise RuntimeError("Unable to inspect original template")
        template = next(e["template"] for e in data["data"]["myself"]["endpoints"] if e["id"] == ENDPOINT)
        if template.get("dockerArgs") not in (None, "", "{}"):
            raise RuntimeError("Custom Docker args require explicit review")
        if not template.get("containerRegistryAuthId"):
            raise RuntimeError("Private CleanerIA image requires reviewed registry authentication")
        if args.reuse_template and template.get("imageName") != IMAGE:
            raise RuntimeError("Reuse template does not contain the reviewed image digest")

        # Validate the CPU path before enabling any GPU capacity.
        if args.prepared_report:
            prepared = json.loads(args.prepared_report.read_text(encoding="utf-8"))
            if prepared["input"] != str(args.source) or prepared["duration"] != duration:
                raise ValueError("Prepared report is for a different sample")
            job = str(uuid.UUID(prepared["hostear_job"]))
            # Verify exact source bytes, not just matching duration/name.
            original = requests.get(signed(job, "source"), timeout=(15, 40))
            if not original.ok or hashlib.sha256(original.content).digest() != hashlib.sha256(args.source.read_bytes()).digest():
                raise ValueError("Prepared Hostear source no longer matches")
            regions = prepared["regions"]
            log("Reusing verified identical Hostear source and detected masks")
        else:
            job = str(uuid.uuid4())
            with args.source.open("rb") as media:
                cpu("POST", job, "upload", data=media, headers={"content-type": "video/mp4",
                    "x-file-name": "sample.mp4", "x-file-size": str(args.source.stat().st_size)})
            log("Hostear upload validated; detecting masks")
            regions = cpu("POST", job, "detect", json={"mode": "smart"})["regions"]
        report["hostear_job"] = job
        if not regions:
            raise RuntimeError("No masks found; refusing crop/fake removal")
        report["regions"] = regions
        plan = cpu("POST", job, "plan", json={"target_seconds": 15, "overlap": 0, "use_scenes": True})
        if len(plan["chunks"]) != 1:
            raise RuntimeError("First validation requires a single scene")
        log(f"Hostear detected {len(regions)} masks; single scene confirmed")

        env = {v["key"]: v["value"] for v in template["env"]}
        configuration = {
            "name": "cleaneria-scene-masks-validation-20260908", "imageName": IMAGE,
            "isServerless": True, "isPublic": False, "category": "NVIDIA",
            "containerDiskInGb": template["containerDiskInGb"], "volumeInGb": 0,
            "volumeMountPath": "/runpod-volume", "ports": [], "env": env}
        if template.get("containerRegistryAuthId"):
            configuration["containerRegistryAuthId"] = template["containerRegistryAuthId"]
        if args.reuse_template:
            if args.reuse_template != old["templateId"]:
                raise RuntimeError("Reuse template does not match reviewed endpoint")
            new = {"id": args.reuse_template}
        else:
            new = api("POST", REST + "/templates", json=configuration)
        report["template_id"] = new["id"]
        save()
        managed = True
        api("PATCH", REST + f"/endpoints/{ENDPOINT}", json={
            "templateId": new["id"], "workersMin": 0, "workersMax": 1,
            "idleTimeout": 5, "executionTimeoutMs": 600000})
        log("Corrected image configured; maximum one worker, minimum zero")
        # Queue API receives endpoint scaling changes asynchronously.
        time.sleep(12)
        capability = run({"action": "health"}, 60)
        report["capabilities"] = capability
        save()
        if capability.get("pipeline_revision") != "scene-masks-v1" or not capability.get("ai_ready"):
            raise RuntimeError("Updated worker/model not ready; refusing an expensive run")
        log("Corrected ProPainter worker ready; submitting ONE 5s sample")
        output = run({"chunk_index": 0, "source_url": signed(job, "chunks/0/source"),
            "source_is_chunk": True, "start": 0, "end": duration, "overlap": 0,
            "mode": "smart", "preset": "quality", "masks": regions,
            "options": {"dynamic": True, "key_step": 1, "verify": True, "selective_second_pass": False,
                        "protect_subject": False, "enhance": False, "strategy": "inpaint"}}, 600)
        encoded = output.pop("output_b64", None)
        report["result"] = output
        save()
        if not encoded:
            raise RuntimeError("No video returned")
        raw = base64.b64decode(encoded, validate=True)
        if hashlib.sha256(raw).hexdigest() != output["checksum"]:
            raise RuntimeError("Output checksum mismatch")
        candidate = args.output / "gpu-candidate-5s.mp4"
        candidate.write_bytes(raw)
        output_info = probe(candidate)
        original_video = next(s for s in info["streams"] if s["codec_type"] == "video")
        result_video = next(s for s in output_info["streams"] if s["codec_type"] == "video")
        if any(original_video[k] != result_video[k] for k in ("width", "height", "r_frame_rate")):
            raise RuntimeError("Output geometry/FPS changed")
        if abs(float(output_info["format"]["duration"]) - duration) > 0.1:
            raise RuntimeError("Output duration changed")
        # Send the GPU artifact to Hostear, then use its assembly route to restore audio.
        part = str(uuid.uuid4())
        report["hostear_part_job"] = part
        with candidate.open("rb") as media:
            cpu("POST", part, "upload", data=media, headers={"content-type": "video/mp4",
                "x-file-name": "gpu.mp4", "x-file-size": str(candidate.stat().st_size)})
        cpu("POST", job, "assemble", json={"parts": [{"index": 0, "url": signed(part, "source")}],
            "metrics": {k: v for k, v in output.items() if k not in ("output_url",)}})
        response = requests.get(signed(job, "result"), timeout=(15, 90))
        if not response.ok:
            raise RuntimeError(f"Hostear result HTTP {response.status_code}")
        final = args.output / "resultado-5s-REVISAR.mp4"
        final.write_bytes(response.content)
        report["final_probe"] = probe(final)
        report["final_video"] = str(final)
        log("Video returned through Hostear; awaiting visual review")
    except Exception as error:
        report["error"] = str(error) if isinstance(error, (RuntimeError, ValueError)) else type(error).__name__
        log("Validation stopped: " + report["error"])
    finally:
        for job in list(pending):
            try:
                api("POST", API + f"/cancel/{job}", json={})
                log(f"Cancellation requested for test job {job}")
            except Exception:
                report["cancellation_failed"] = True
        if managed:
            try:
                api("PATCH", REST + f"/endpoints/{ENDPOINT}", json={"workersMin": 0, "workersMax": 0})
                report["capacity_disabled"] = True
                log("RunPod capacity set to ZERO; no volumes deleted")
            except Exception:
                report["capacity_disabled"] = False
                log("WARNING: unable to disable GPU capacity")
        try:
            report["final_health"] = api("GET", API + "/health")
        except Exception:
            report["final_health"] = "unavailable"
        save()


if __name__ == "__main__":
    main()
