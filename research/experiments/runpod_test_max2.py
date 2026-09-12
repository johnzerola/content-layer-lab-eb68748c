"""One bounded real Hostear -> RunPod -> Hostear validation. No automatic retries.

Secrets are supplied through process environment, never CLI arguments or reports.
Always caps this endpoint to zero workers on exit; does not delete volumes.
"""
import argparse
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "backend/scripts"))
from audit_runpod_costs import read_env
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
    global ENDPOINT, API
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reuse-template", help="Explicit existing template ID after configuration review")
    parser.add_argument("--allow-owned-isolated-endpoint", action="store_true",
                        help="Allow a temporary endpoint named cleaneria-phase3-isolated-* owned by the caller")
    parser.add_argument("--queue-seconds", type=int, default=180,
                        help="Cold-start allowance added to execution timeout (180..900)")
    parser.add_argument("--sync-graphql", action="store_true", help="Diagnose queue/control-plane divergence using documented saveEndpoint mutation")
    parser.add_argument("--prepared-report", type=Path, help="Reuse this exact sample's verified Hostear upload/masks")
    parser.add_argument("--expected-revision", default="scene-roi-v3", help="Required revision before any inpainting job")
    parser.add_argument("--image", required=True, help="Reviewed GPU image containing this revision, pinned by sha256 digest")
    parser.add_argument("--mode", choices=("subtitle", "smart", "karaoke"), default="subtitle")
    parser.add_argument("--regions", type=Path, help="Reviewed normalized regions; avoids an unrelated automatic full-screen selection")
    parser.add_argument("--endpoint", default=ENDPOINT, help="Explicit reviewed endpoint; must match RUNPOD_ENDPOINT_ID")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]{8,32}", args.endpoint):
        raise ValueError("Invalid endpoint ID")
    ENDPOINT = args.endpoint
    API = f"https://api.runpod.ai/v2/{ENDPOINT}"
    if not re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", args.image):
        raise ValueError("GPU image must use an immutable sha256 digest")
    info = probe(args.source)
    duration = float(info["format"]["duration"])
    if not 0 < duration <= 5.05:
        raise ValueError("Only a <=5 second sample is allowed")
    os.environ.update(read_env(Path(".env.local")))
    key = os.environ["RUNPOD_API_KEY"]
    secret = os.environ["CLEANER_WORKER_SECRET"]
    if not 180 <= args.queue_seconds <= 900:
        raise ValueError("queue-seconds must be between 180 and 900")
    if os.environ.get("RUNPOD_ENDPOINT_ID") != ENDPOINT and not args.allow_owned_isolated_endpoint:
        raise ValueError("Unexpected endpoint")
    args.output.mkdir(parents=True, exist_ok=False)
    report = {"input": str(args.source), "duration": duration, "endpoint_id": ENDPOINT,
              "image": args.image, "jobs": []}
    report_file = args.output / "report.json"
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    pending = set()
    managed = False
    owned_jobs = []

    def save():
        report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=(15, 40), **kwargs)
        if not response.ok:
            detail = re.sub(r"https?://\S+", "[URL]", response.text).replace(key, "[SECRET]").replace(secret, "[SECRET]")[:300]
            raise RuntimeError(f"RunPod {method} {url.split('?')[0]} HTTP {response.status_code}: {detail}")
        return response.json() if response.content else {}

    def token(job, scope):
        value = f"v2.{job}.{int(time.time()) + 1800}.{scope}"
        return value + "." + hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()

    def sync_endpoint(template_id, maximum):
        mutation = 'mutation { saveEndpoint(input: { id: %s, name: %s, templateId: %s, workersMin: 0, workersMax: %d }) { id templateId workersMin workersMax } }' % (json.dumps(ENDPOINT), json.dumps(old['name']), json.dumps(template_id), maximum)
        reply = api("POST", "https://api.runpod.io/graphql", json={"query": mutation})
        if reply.get("errors"):
            raise RuntimeError("GraphQL saveEndpoint rejected; no further jobs submitted")
        return reply["data"]["saveEndpoint"]

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
            "policy": {"executionTimeout": seconds * 1000, "ttl": (seconds + args.queue_seconds) * 1000}})
        job = reply["id"]
        pending.add(job)
        report["jobs"].append({"id": job, "action": payload.get("action", "inpaint")})
        save()
        deadline = time.monotonic() + seconds + args.queue_seconds
        last = 0
        while time.monotonic() < deadline:
            status = api("GET", API + f"/status/{job}")
            state = status.get("status")
            if time.monotonic() - last > 20:
                log(f"RunPod {payload.get('action', 'inpaint')}: {state}")
                last = time.monotonic()
            if state == "COMPLETED":
                pending.remove(job)
                report["jobs"][-1].update({"provider_execution_ms": status.get("executionTime"),
                                           "provider_delay_ms": status.get("delayTime")})
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

    def billing_snapshot():
        try:
            data = api("POST", "https://api.runpod.io/graphql", json={
                "query": "query { myself { clientBalance currentSpendPerHr } }"})
            account = (data.get("data") or {}).get("myself") or {}
            return {"unix_time": time.time(), "client_balance_usd": account.get("clientBalance"),
                    "current_usd_per_hour": account.get("currentSpendPerHr")}
        except Exception:
            return {"unavailable": True}

    try:
        health = api("GET", API + "/health")
        if health["jobs"].get("inProgress", 0) or health["jobs"].get("inQueue", 0):
            raise RuntimeError("Other jobs exist; not changing their endpoint")
        old = api("GET", REST + f"/endpoints/{ENDPOINT}")
        if os.environ.get("RUNPOD_ENDPOINT_ID") != ENDPOINT:
            if not args.allow_owned_isolated_endpoint or not str(old.get("name") or "").startswith("cleaneria-phase3-isolated-"):
                raise RuntimeError("Endpoint is not the reviewed temporary test endpoint")
        report["billing_before"] = billing_snapshot()
        report["previous"] = {k: old.get(k) for k in ("templateId", "workersMin", "workersMax", "idleTimeout")}
        template = api("GET", REST + "/templates/" + old["templateId"])
        if template.get("dockerArgs") not in (None, "", "{}"):
            raise RuntimeError("Custom Docker args require explicit review")
        if not template.get("containerRegistryAuthId"):
            raise RuntimeError("Private CleanerIA image requires reviewed registry authentication")
        if args.reuse_template and template.get("imageName") != args.image:
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
            owned_jobs.append(job)
            with args.source.open("rb") as media:
                cpu("POST", job, "upload", data=media, headers={"content-type": "video/mp4",
                    "x-file-name": "sample.mp4", "x-file-size": str(args.source.stat().st_size)})
            log("Hostear upload validated; detecting masks")
            regions = (json.loads(args.regions.read_text(encoding="utf-8")) if args.regions
                       else cpu("POST", job, "detect", json={"mode": args.mode})["regions"])
        report["hostear_job"] = job
        if not regions:
            raise RuntimeError("No masks found; refusing crop/fake removal")
        report["regions"] = regions
        plan = cpu("POST", job, "plan", json={"target_seconds": 15, "overlap": 0, "use_scenes": True})
        if len(plan["chunks"]) != 1:
            raise RuntimeError("First validation requires a single scene")
        log(f"Hostear detected {len(regions)} masks; single scene confirmed")

        env = template["env"] if isinstance(template["env"], dict) else {v["key"]: v["value"] for v in template["env"]}
        configuration = {
            "name": "cleaneria-phase3-" + uuid.uuid4().hex[:10], "imageName": args.image,
            "isServerless": True, "isPublic": False, "category": "NVIDIA",
            "containerDiskInGb": 80, "volumeInGb": 0,
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
            "templateId": new["id"], "workersMin": 0, "workersMax": 2,
            "idleTimeout": 5, "executionTimeoutMs": 600000,
            # Prefer broader-capacity pools; RunPod falls back in this order.
            "gpuTypeIds": old.get("gpuTypeIds") or ["NVIDIA A40", "NVIDIA L40S", "NVIDIA RTX A5000"]})
        configured = api("GET", REST + f"/endpoints/{ENDPOINT}")
        if args.sync_graphql:
            report["graphql_configuration"] = sync_endpoint(new["id"], 1)
            save()
        if (configured.get("workersMin") != 0 or configured.get("workersMax") != 2
                or configured.get("templateId") != new["id"]):
            raise RuntimeError("Endpoint did not confirm the reviewed template and one-worker limit")
        log("Corrected image configured; maximum two workers, minimum zero")
        # Queue API receives endpoint scaling changes asynchronously.
        time.sleep(60)
        capability = run({"action": "health"}, 60)
        report["capabilities"] = capability
        save()
        if capability.get("pipeline_revision") != args.expected_revision or not capability.get("max_ready"):
            raise RuntimeError("Updated worker/model not ready; refusing an expensive run")
        log(f"DiffuEraser worker ready; submitting ONE {duration:.2f}s sample")
        output = run({"chunk_index": 0, "source_url": signed(job, "chunks/0/source"),
            "source_is_chunk": True, "start": 0, "end": duration, "overlap": 0,
            "expected_revision": args.expected_revision,
            "mode": args.mode, "preset": "max", "masks": regions,
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
        owned_jobs.append(part)
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
                # TTL can remove a queued diagnostic before /cancel arrives.
                # Even a second network failure must not skip capacity shutdown.
                try:
                    check = session.get(API + f"/status/{job}", timeout=(15, 40))
                    if check.status_code == 404:
                        report.setdefault("expired_provider_jobs", []).append(job)
                    else:
                        report["cancellation_failed"] = True
                except Exception:
                    report["cancellation_failed"] = True
        if managed:
            try:
                api("PATCH", REST + f"/endpoints/{ENDPOINT}", json={"workersMin": 0, "workersMax": 0})
                stopped = api("GET", REST + f"/endpoints/{ENDPOINT}")
                if stopped.get("workersMin") != 0 or stopped.get("workersMax") != 0:
                    raise RuntimeError("Endpoint did not confirm zero capacity")
                report["capacity_disabled"] = True
                api("PATCH", REST + f"/endpoints/{ENDPOINT}", json={"templateId": old["templateId"], "gpuTypeIds": old["gpuTypeIds"]})
                if args.sync_graphql:
                    report["graphql_restoration"] = sync_endpoint(old["templateId"], 0)
                report["original_configuration_restored"] = True
                if report.get("template_id") != old["templateId"]:
                    api("DELETE", REST + "/templates/" + report["template_id"])
                report["capacity_disabled"] = True
                log("RunPod capacity set to ZERO; no volumes deleted")
            except Exception:
                report.setdefault("capacity_disabled", False)
                report["configuration_cleanup_failed"] = True
                log("WARNING: configuration cleanup incomplete; inspect capacity_disabled in report")
        try:
            report["final_health"] = api("GET", API + "/health")
        except Exception:
            report["final_health"] = "unavailable"
        report["billing_after"] = billing_snapshot()
        report["billing_note"] = "Account balance delta includes storage and may be delayed; not a per-video invoice"
        report["temporary_projects_deleted"] = []
        for owned_job in owned_jobs:
            try:
                response = requests.delete(f"{HOST}/v1/jobs/{owned_job}",
                    headers={"x-job-token": token(owned_job, "control")}, timeout=(15, 40))
                if response.ok:
                    report["temporary_projects_deleted"].append(owned_job)
                else:
                    report.setdefault("project_cleanup_pending", []).append(owned_job)
            except Exception:
                report.setdefault("project_cleanup_pending", []).append(owned_job)
        save()

    return int(bool(report.get("error") or report.get("cancellation_failed")
                    or report.get("project_cleanup_pending")
                    or (managed and not report.get("capacity_disabled"))))


if __name__ == "__main__":
    raise SystemExit(main())

