"""Create one disposable RunPod endpoint and run one bounded phase-3 sample."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend/scripts"))
from audit_runpod_costs import read_env


REST = "https://rest.runpod.io/v1"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--image", required=True)
    parser.add_argument("--regions", type=Path, required=True)
    parser.add_argument("--use-reviewed-volume", action="store_true",
                        help="Attach the original endpoint network volume at /runpod-volume; never delete it")
    args = parser.parse_args()
    if not re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", args.image):
        raise ValueError("image must use an immutable sha256 digest")
    if args.output.exists():
        raise FileExistsError(args.output)

    values = read_env(Path(".env.local"))
    session = requests.Session()
    session.headers["Authorization"] = "Bearer " + values["RUNPOD_API_KEY"]
    evidence = Path("research/benchmarks/runs") / ("phase3-isolated-orchestrator-" + str(time.time_ns()))
    evidence.mkdir(parents=True, exist_ok=False)
    report_path = evidence / "report.json"
    report = {"status": "preparing", "template_id": None, "endpoint_id": None,
              "cleanup_errors": [], "image": args.image, "output": str(args.output)}

    def save():
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def call(method, url, **kwargs):
        response = session.request(method, url, timeout=(10, 40), **kwargs)
        if not response.ok:
            detail = re.sub(r"https?://\S+", "[URL]", response.text)[:300]
            raise RuntimeError(f"RunPod {method} {url.split('?')[0]} HTTP {response.status_code}: {detail}")
        return response.json() if response.content else {}

    try:
        original = call("GET", REST + "/endpoints/" + values["RUNPOD_ENDPOINT_ID"])
        source_template = call("GET", REST + "/templates/" + original["templateId"])
        suffix = uuid.uuid4().hex[:10]
        configuration = {
            "name": "cleaneria-phase3-isolated-" + suffix,
            "imageName": args.image,
            "isServerless": True,
            "isPublic": False,
            "category": "NVIDIA",
            "containerDiskInGb": 30,
            "volumeInGb": 0,
            "volumeMountPath": "/runpod-volume",
            "ports": [],
            "env": source_template.get("env") or {},
        }
        if source_template.get("containerRegistryAuthId"):
            configuration["containerRegistryAuthId"] = source_template["containerRegistryAuthId"]
        volume_id = original.get("networkVolumeId")
        if args.use_reviewed_volume:
            if not volume_id:
                raise RuntimeError("Original endpoint has no reviewed network volume")
            report["preserved_network_volume_id"] = volume_id
        report["template_id"] = call("POST", REST + "/templates", json=configuration)["id"]
        endpoint_configuration = {
            "name": "cleaneria-phase3-isolated-" + suffix,
            "templateId": report["template_id"],
            "computeType": "GPU",
            "gpuCount": 1,
            "gpuTypeIds": ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3090", "NVIDIA RTX A5000"],
            "workersMin": 0,
            "workersMax": 1,
            "idleTimeout": 5,
            "executionTimeoutMs": 600000,
            "scalerType": "QUEUE_DELAY",
            "scalerValue": 4,
        }
        if args.use_reviewed_volume:
            endpoint_configuration["networkVolumeId"] = volume_id
            endpoint_configuration["dataCenterIds"] = ["EU-RO-1"]
        report["endpoint_id"] = call("POST", REST + "/endpoints", json=endpoint_configuration)["id"]
        report["status"] = "waiting_for_queue_api"
        save()
        api = "https://api.runpod.ai/v2/" + report["endpoint_id"]
        for _ in range(60):
            ready = session.get(api + "/health", timeout=(10, 30))
            if ready.ok:
                break
            if ready.status_code not in (403, 404, 503):
                raise RuntimeError(f"Queue health HTTP {ready.status_code}")
            time.sleep(5)
        else:
            raise RuntimeError("Queue API did not become available within 300 seconds")
        report["status"] = "running_sample"
        save()
        command = [sys.executable, str(Path(__file__).with_name("phase3_existing_endpoint.py")),
                   str(args.source), str(args.output), "--endpoint", report["endpoint_id"],
                   "--reuse-template", report["template_id"], "--allow-owned-isolated-endpoint",
                   "--queue-seconds", "900", "--image", args.image, "--regions", str(args.regions)]
        completed = subprocess.run(command, timeout=1800)
        report["runner_exit_code"] = completed.returncode
        inner = args.output / "report.json"
        if inner.exists():
            inner_report = json.loads(inner.read_text(encoding="utf-8"))
            report["sample_status"] = "completed" if inner_report.get("final_video") else "failed"
            report["sample_error"] = inner_report.get("error")
        report["status"] = "sample_finished"
    except subprocess.TimeoutExpired:
        report.update(status="failed", error="Hard 1800-second runner deadline reached")
    except Exception as exc:
        report.update(status="failed", error=str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__)
    finally:
        endpoint = report.get("endpoint_id")
        if endpoint:
            inner = args.output / "report.json"
            if inner.exists():
                try:
                    for job in json.loads(inner.read_text(encoding="utf-8")).get("jobs", []):
                        try:
                            call("POST", f"https://api.runpod.ai/v2/{endpoint}/cancel/{job['id']}", json={})
                        except Exception:
                            pass
                except Exception:
                    report["cleanup_errors"].append("inner_job_scan_failed")
            try:
                call("PATCH", REST + "/endpoints/" + endpoint, json={"workersMin": 0, "workersMax": 0})
                report["zero_capacity"] = True
            except Exception:
                report["cleanup_errors"].append("zero_capacity_not_confirmed")
            for attempt in range(3):
                try:
                    call("DELETE", REST + "/endpoints/" + endpoint)
                    report["endpoint_deleted"] = True
                    break
                except Exception:
                    if attempt == 2:
                        report["cleanup_errors"].append("endpoint_delete_not_confirmed")
                    else:
                        time.sleep(10)
        template = report.get("template_id")
        if template:
            try:
                call("DELETE", REST + "/templates/" + template)
                report["template_deleted"] = True
            except Exception:
                report["cleanup_errors"].append("template_delete_not_confirmed")
        save()
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
