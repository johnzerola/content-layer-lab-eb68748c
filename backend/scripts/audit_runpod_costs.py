"""Read-only account audit; never starts a worker or prints tokens/signed URLs."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import requests


def read_env(path: Path) -> dict[str, str]:
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return {**values, **os.environ}


def audit(key: str, endpoint_id: str) -> dict:
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {key}"})

    def get(path):
        response = session.get(f"https://rest.runpod.io/v1/{path}", timeout=25)
        if not response.ok:
            raise RuntimeError(f"RunPod GET {path.split('/')[0]}: HTTP {response.status_code}")
        return response.json()

    endpoint = get(f"endpoints/{endpoint_id}")
    pods = get("pods")
    volumes = get("networkvolumes")
    health_response = session.get(f"https://api.runpod.ai/v2/{endpoint_id}/health", timeout=25)
    health_response.raise_for_status()
    health = health_response.json()
    # This POST contains a GraphQL query, not a resource mutation.
    billing = session.post("https://api.runpod.io/graphql", json={
        "query": "query { myself { currentSpendPerHr } }"}, timeout=25)
    account = (billing.json().get("data") or {}).get("myself") or {} if billing.ok else {}
    fields = ("id", "name", "workersMin", "workersMax", "gpuCount", "gpuTypeIds",
              "idleTimeout", "executionTimeoutMs", "networkVolumeId", "templateId")
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "read_only": True,
        "endpoint": {k: endpoint.get(k) for k in fields},
        "workers": health.get("workers"), "jobs": health.get("jobs"),
        "pods": [{k: pod.get(k) for k in ("id", "name", "desiredStatus", "costPerHr", "gpuCount")}
                 for pod in pods],
        "volumes": [{k: volume.get(k) for k in ("id", "name", "size", "dataCenterId")}
                    for volume in volumes],
        "account_current_usd_per_hour": account.get("currentSpendPerHr"),
        "billing_scope": "current account rate, not historical invoice or cost of one video",
        "public_serverless_pricing": "https://www.runpod.io/pricing",
        "billing_rules": "https://docs.runpod.io/serverless/pricing",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env.local"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    values = read_env(args.env_file)
    key, endpoint = values.get("RUNPOD_API_KEY"), values.get("RUNPOD_ENDPOINT_ID")
    if not key or not endpoint:
        parser.error("RUNPOD_API_KEY e RUNPOD_ENDPOINT_ID precisam estar configurados")
    try:
        result = audit(key, endpoint)
    except Exception as error:
        # Request exceptions can contain headers/URLs: keep console output safe.
        raise SystemExit(f"Auditoria indisponivel ({type(error).__name__}); nenhum recurso alterado")
    document = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(document, encoding="utf-8")
    print(document)


if __name__ == "__main__":
    main()
