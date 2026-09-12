"""Run exactly one paid Golden V4 final validation with frozen inputs.

The script performs read-only/control-plane preflight, creates an isolated
template, submits one inference job, downloads separately persisted evidence,
and restores zero endpoint capacity. It never retries the inference job.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "scripts"))
from audit_runpod_costs import read_env  # noqa: E402


REST = "https://rest.runpod.io/v1"
HOST = "https://cleaner-104-234-186-50.nip.io"
EXPECTED_INPUT_SHA256 = "c6fc2c2d9b947e0f45008ab7f84841f86fa90b160d6372fb20fec95d95b0fb64"
EXPECTED_GPU = "NVIDIA GeForce RTX 4090"
EXECUTION_TIMEOUT_MS = 1_800_000
TTL_MS = 3_600_000


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,pix_fmt",
        "-of", "json", str(path),
    ], text=True))


def video_contract(info: dict) -> dict:
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    return {
        "width": int(video["width"]), "height": int(video["height"]),
        "fps": video.get("avg_frame_rate") or video.get("r_frame_rate"),
        "frames": int(video.get("nb_frames") or 0),
        "duration": float(info["format"]["duration"]),
        "codec": video.get("codec_name"), "pix_fmt": video.get("pix_fmt"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--regions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"docker\.io/nivaldo12/leaneria-runpod@sha256:[0-9a-f]{64}", args.image):
        raise ValueError("image must be the reviewed immutable Docker digest")
    if sha256(args.source) != EXPECTED_INPUT_SHA256:
        raise ValueError("final validation input hash differs from the frozen contract")
    contract = video_contract(probe(args.source))
    if (contract["width"], contract["height"], contract["fps"], contract["frames"]) != (1080, 1920, "30/1", 147):
        raise ValueError(f"final validation geometry differs from frozen contract: {contract}")
    if abs(contract["duration"] - 4.9) > 0.01:
        raise ValueError("final validation duration differs from frozen contract")
    regions = json.loads(args.regions.read_text(encoding="utf-8"))
    if len(regions) != 2:
        raise ValueError("exactly two frozen Golden V4 regions are required")
    expected_boxes = [(0.58, 0.052, 0.008), (0.58, 0.052, 0.008)]
    if [(r.get("w"), r.get("h"), r.get("grow")) for r in regions] != expected_boxes:
        raise ValueError("regions differ from the frozen corrected boxes")

    os.environ.update(read_env(Path(".env.local")))
    endpoint = os.environ["RUNPOD_ENDPOINT_ID"]
    key = os.environ["RUNPOD_API_KEY"]
    secret = os.environ["CLEANER_WORKER_SECRET"]
    api_base = f"https://api.runpod.ai/v2/{endpoint}"
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    args.output.mkdir(parents=True, exist_ok=False)
    report_path = args.output / "run-report.json"
    report = {
        "schema": "phase6-golden-v4-final-validation-v1", "commit": args.commit,
        "tag": args.tag, "image": args.image, "endpoint_id": endpoint,
        "input": {"path": str(args.source), "sha256": EXPECTED_INPUT_SHA256, **contract},
        "regions": regions, "engine": "diffueraser", "quality_profile": "legacy_refined",
        "mode": "subtitle", "jobs_submitted": 0,
    }
    old = None
    temp_template = None
    owned_hostear_jobs: list[str] = []
    provider_job = None
    configured = False

    def save() -> None:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def api(method: str, url: str, **kwargs):
        response = session.request(method, url, timeout=(15, 60), **kwargs)
        if not response.ok:
            detail = re.sub(r"https?://\S+", "[URL]", response.text)
            detail = detail.replace(key, "[SECRET]").replace(secret, "[SECRET]")[:500]
            raise RuntimeError(f"RunPod {method} {url.split('?')[0]} HTTP {response.status_code}: {detail}")
        return response.json() if response.content else {}

    def token(job: str, scope: str, lifetime: int = 7200) -> str:
        unsigned = f"v2.{job}.{int(time.time()) + lifetime}.{scope}"
        signature = hmac.new(secret.encode(), unsigned.encode(), hashlib.sha256).hexdigest()
        return f"{unsigned}.{signature}"

    def signed(job: str, route: str) -> str:
        return f"{HOST}/v1/jobs/{job}/{route}?token={token(job, 'result')}"

    def hostear_upload(job: str, path: Path) -> dict:
        with path.open("rb") as media:
            response = requests.post(f"{HOST}/v1/jobs/{job}/upload", data=media,
                headers={"x-job-token": token(job, "upload"), "content-type": "video/mp4",
                         "x-file-name": path.name, "x-file-size": str(path.stat().st_size)},
                timeout=(15, 600))
        if not response.ok:
            raise RuntimeError(f"Hostear upload HTTP {response.status_code}")
        return response.json()

    def graphql_endpoint(template_id: str, maximum: int) -> dict:
        assert old is not None
        mutation = (
            "mutation { saveEndpoint(input: { id: %s, name: %s, templateId: %s, "
            "workersMin: 0, workersMax: %d }) { id templateId workersMin workersMax } }"
            % (json.dumps(endpoint), json.dumps(old["name"]), json.dumps(template_id), maximum)
        )
        reply = api("POST", "https://api.runpod.io/graphql", json={"query": mutation})
        if reply.get("errors"):
            raise RuntimeError("RunPod GraphQL endpoint synchronization failed")
        return reply["data"]["saveEndpoint"]

    def billing() -> dict:
        try:
            reply = api("POST", "https://api.runpod.io/graphql",
                        json={"query": "query { myself { clientBalance currentSpendPerHr } }"})
            account = (reply.get("data") or {}).get("myself") or {}
            return {"unix_time": time.time(), "client_balance_usd": account.get("clientBalance"),
                    "current_usd_per_hour": account.get("currentSpendPerHr")}
        except Exception:
            return {"unavailable": True}

    try:
        health = api("GET", api_base + "/health")
        if health["jobs"].get("inProgress", 0) or health["jobs"].get("inQueue", 0):
            raise RuntimeError("endpoint already has a queued/running job")
        old = api("GET", REST + f"/endpoints/{endpoint}")
        template = api("GET", REST + "/templates/" + old["templateId"])
        report["previous_endpoint"] = {key: old.get(key) for key in (
            "templateId", "workersMin", "workersMax", "idleTimeout", "executionTimeoutMs", "gpuTypeIds"
        )}
        report["billing_before"] = billing()
        save()

        source_job = str(uuid.uuid4())
        owned_hostear_jobs.append(source_job)
        report["source_hostear_job"] = source_job
        report["source_upload"] = hostear_upload(source_job, args.source)
        source_check = requests.get(signed(source_job, "source"), timeout=(15, 120))
        source_check.raise_for_status()
        if hashlib.sha256(source_check.content).hexdigest() != EXPECTED_INPUT_SHA256:
            raise RuntimeError("Hostear source hash differs after upload")

        artifact_names = (
            "diffueraser_upstream", "diffueraser_pure", "junctions",
            "master_lossless", "delivery_final",
        )
        artifact_jobs = {name: str(uuid.uuid4()) for name in artifact_names}
        owned_hostear_jobs.extend(artifact_jobs.values())
        report["artifact_hostear_jobs"] = artifact_jobs

        env = template["env"] if isinstance(template.get("env"), dict) else {
            item["key"]: item["value"] for item in template.get("env", [])
        }
        env.update({
            "CLEANER_PERSIST_FAILURE_ARTIFACTS": "1",
            "CLEANER_FAILURE_ARTIFACT_MAX_BYTES": str(256 * 1024 * 1024),
            "CLEANER_FAILURE_INLINE_MAX_BYTES": str(8 * 1024 * 1024),
            "CLEANER_IMAGE_DIGEST": args.image,
            "CLEANER_SUBTITLE_JUNCTIONS": "1",
        })
        configuration = {
            "name": "cleaneria-phase6-smoke-" + uuid.uuid4().hex[:10],
            "imageName": args.image, "isServerless": True, "isPublic": False,
            "category": "NVIDIA", "containerDiskInGb": 80, "volumeInGb": 0,
            "volumeMountPath": "/runpod-volume", "ports": [], "env": env,
        }
        if template.get("containerRegistryAuthId"):
            configuration["containerRegistryAuthId"] = template["containerRegistryAuthId"]
        created = api("POST", REST + "/templates", json=configuration)
        temp_template = created["id"]
        report["temporary_template_id"] = temp_template
        api("PATCH", REST + f"/endpoints/{endpoint}", json={
            "templateId": temp_template, "workersMin": 0, "workersMax": 1,
            "idleTimeout": 5, "executionTimeoutMs": EXECUTION_TIMEOUT_MS,
            "gpuTypeIds": [EXPECTED_GPU],
        })
        report["graphql_configuration"] = graphql_endpoint(temp_template, 1)
        configured = True
        current = api("GET", REST + f"/endpoints/{endpoint}")
        report["test_endpoint"] = {key: current.get(key) for key in (
            "templateId", "workersMin", "workersMax", "idleTimeout", "executionTimeoutMs", "gpuTypeIds"
        )}
        if (current.get("templateId") != temp_template or current.get("workersMin") != 0
                or current.get("workersMax") != 1 or current.get("gpuTypeIds") != [EXPECTED_GPU]):
            raise RuntimeError("isolated endpoint configuration was not confirmed")
        save()
        print("Endpoint isolated on RTX 4090; waiting for control-plane propagation", flush=True)
        time.sleep(60)

        uploads = {
            name: {"url": f"{HOST}/v1/jobs/{job}/upload", "token": token(job, "upload"),
                   "filename": f"{name}.mp4", "output_url": signed(job, "source")}
            for name, job in artifact_jobs.items()
        }
        payload = {
            "chunk_index": 0, "source_url": signed(source_job, "source"),
            "source_is_chunk": True, "start": 0, "end": 4.9, "overlap": 0,
            "expected_revision": "scene-roi-v4", "mode": "subtitle", "preset": "max",
            "masks": regions, "artifact_uploads": uploads,
            "options": {"dynamic": True, "key_step": 1, "verify": True,
                        "selective_second_pass": False, "protect_subject": False,
                        "enhance": False, "strategy": "inpaint",
                        "quality_profile": "legacy_refined", "engine": "diffueraser"},
        }
        submission = api("POST", api_base + "/run", json={
            "input": payload,
            "policy": {"executionTimeout": EXECUTION_TIMEOUT_MS, "ttl": TTL_MS},
        })
        provider_job = submission["id"]
        report["jobs_submitted"] = 1
        report["job_id"] = provider_job
        report["submitted_at"] = time.time()
        save()
        print(f"Single paid smoke submitted: {provider_job}", flush=True)

        deadline = time.monotonic() + TTL_MS / 1000
        last_log = 0.0
        status = None
        while time.monotonic() < deadline:
            status = api("GET", api_base + f"/status/{provider_job}")
            state = status.get("status")
            if time.monotonic() - last_log >= 20:
                print(f"RunPod smoke: {state}", flush=True)
                last_log = time.monotonic()
            if state in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"):
                break
            time.sleep(3)
        if not status or status.get("status") != "COMPLETED":
            report["provider_status"] = status
            raise RuntimeError("single smoke did not complete successfully")
        report["provider_execution_ms"] = status.get("executionTime")
        report["provider_delay_ms"] = status.get("delayTime")
        output = status.get("output")
        if not isinstance(output, dict):
            report["worker_output"] = output
            raise RuntimeError("worker returned no structured output")
        report["worker_output"] = {key: value for key, value in output.items()
                                   if key != "failure_bundle_b64"}
        if output.get("failure_bundle_b64"):
            import base64
            bundle = args.output / "failure-bundle.zip"
            bundle.write_bytes(base64.b64decode(output["failure_bundle_b64"], validate=True))
            report["failure_bundle"] = {"path": str(bundle), "sha256": sha256(bundle),
                                        "bytes": bundle.stat().st_size}
        for report_name, output_key in (
            ("diffueraser.report.json", "diffueraser_report"),
            ("subtitle-junctions.report.json", "subtitle_junctions_report"),
            ("diagnostic-report.json", "diagnostic_report"),
        ):
            if output.get(output_key) is not None:
                (args.output / report_name).write_text(
                    json.dumps(output[output_key], ensure_ascii=False, indent=2), encoding="utf-8"
                )
        local_names = {
            "diffueraser_upstream": "A0-diffueraser-upstream-roi.mp4",
            "diffueraser_pure": "A-diffueraser-pure-native.mp4",
            "junctions": "B-diffueraser-junctions.mp4",
            "master_lossless": "C-master-lossless.mp4",
            "delivery_final": "D-delivery-final.mp4",
        }
        report["downloaded_artifacts"] = {}
        for name, filename in local_names.items():
            expected = (output.get("artifacts") or {}).get(name) or {}
            if expected.get("error") or not expected.get("sha256"):
                continue
            response = requests.get(signed(artifact_jobs[name], "source"), timeout=(15, 600))
            response.raise_for_status()
            target = args.output / filename
            target.write_bytes(response.content)
            actual_hash = sha256(target)
            if actual_hash != expected["sha256"]:
                raise RuntimeError(f"artifact checksum mismatch: {name}")
            report["downloaded_artifacts"][name] = {
                "path": str(target), "bytes": target.stat().st_size,
                "sha256": actual_hash, "probe": video_contract(probe(target)),
            }
        save()
        if output.get("ok") is not True:
            raise RuntimeError("single smoke completed with worker ok=false")
        if output.get("gpu_name") != EXPECTED_GPU:
            raise RuntimeError(f"unexpected GPU: {output.get('gpu_name')}")
        if output.get("quality_profile") != "legacy_refined" or output.get("engine") != "diffueraser-official":
            raise RuntimeError("worker did not confirm frozen engine/profile")

        missing = {"master_lossless", "delivery_final"} - set(report["downloaded_artifacts"])
        if missing:
            raise RuntimeError("missing required success artifacts: " + ", ".join(sorted(missing)))
        report["completed"] = True
        save()
    except Exception as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
        print("Smoke stopped: " + report["error"], flush=True)
    finally:
        if provider_job and report.get("jobs_submitted") == 1 and not report.get("provider_execution_ms"):
            try:
                api("POST", api_base + f"/cancel/{provider_job}", json={})
                report["cancellation_requested"] = True
            except Exception:
                report["cancellation_requested"] = False
        if configured and old is not None:
            try:
                api("PATCH", REST + f"/endpoints/{endpoint}", json={
                    "workersMin": 0, "workersMax": 0,
                    "templateId": old["templateId"], "gpuTypeIds": old["gpuTypeIds"],
                    "idleTimeout": old.get("idleTimeout", 10),
                    "executionTimeoutMs": old.get("executionTimeoutMs", 600000),
                })
                report["graphql_restoration"] = graphql_endpoint(old["templateId"], 0)
                stopped = api("GET", REST + f"/endpoints/{endpoint}")
                report["endpoint_restored"] = (
                    stopped.get("workersMin") == 0 and stopped.get("workersMax") == 0
                    and stopped.get("templateId") == old["templateId"]
                )
            except Exception as cleanup_exc:
                report["endpoint_restore_error"] = f"{type(cleanup_exc).__name__}: {cleanup_exc}"
        if temp_template:
            try:
                api("DELETE", REST + "/templates/" + temp_template)
                report["temporary_template_deleted"] = True
            except Exception:
                report["temporary_template_deleted"] = False
        report["billing_after"] = billing()
        before = report.get("billing_before", {}).get("client_balance_usd")
        after = report.get("billing_after", {}).get("client_balance_usd")
        report["estimated_cost_usd"] = (before - after) if isinstance(before, (int, float)) and isinstance(after, (int, float)) else None
        report["hostear_cleanup"] = {}
        for job in owned_hostear_jobs:
            try:
                response = requests.delete(f"{HOST}/v1/jobs/{job}",
                    headers={"x-job-token": token(job, "control")}, timeout=(15, 60))
                report["hostear_cleanup"][job] = response.ok
            except Exception:
                report["hostear_cleanup"][job] = False
        save()
    return 0 if report.get("completed") and report.get("endpoint_restored") else 1


if __name__ == "__main__":
    raise SystemExit(main())
