"""Validated public synthetic voice catalog for ChatScene.

Catalog references are generated from licensed synthetic models and are never
resolved from user-controlled paths. Private user references remain handled by
the account-scoped UUID storage in ``service.py``.
"""

import json
import os
from pathlib import Path
import re


CATALOG_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def catalog_root(service_root: Path) -> Path:
    return Path(
        os.environ.get("CHATSCENE_SYNTHETIC_CATALOG_DIR", str(service_root / "catalog"))
    ).resolve()


def catalog_license_approved() -> bool:
    return os.environ.get("CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED") == "1"


def load_catalog(service_root: Path) -> list[dict]:
    """Return only installed, allowlisted and license-approved voices."""
    if not catalog_license_approved():
        return []
    root = catalog_root(service_root)
    manifest = root / "catalog.json"
    try:
        raw = json.loads(manifest.read_text(encoding="utf-8"))
        if raw.get("schemaVersion") != 1 or raw.get("license") != "Apache-2.0":
            return []
        voices = raw.get("voices")
        if not isinstance(voices, list):
            return []
        installed = []
        for item in voices:
            if not isinstance(item, dict):
                continue
            voice_id = item.get("id")
            if not isinstance(voice_id, str) or not CATALOG_ID.fullmatch(voice_id):
                continue
            wav = (root / f"{voice_id}.wav").resolve()
            if wav.parent != root or not wav.is_file():
                continue
            installed.append(
                {
                    "id": voice_id,
                    "name": str(item.get("name", voice_id))[:80],
                    "gender": str(item.get("gender", "neutra"))[:20],
                    "age": str(item.get("age", "adulta"))[:20],
                    "style": str(item.get("style", "natural"))[:40],
                    "description": str(item.get("description", ""))[:160],
                }
            )
        return installed
    except (OSError, ValueError, TypeError, KeyError):
        return []


def catalog_reference_path(service_root: Path, voice_id: str) -> Path:
    installed = {voice["id"] for voice in load_catalog(service_root)}
    if voice_id not in installed:
        raise ValueError("Esta voz do catálogo ainda não está instalada e aprovada.")
    root = catalog_root(service_root)
    path = (root / f"{voice_id}.wav").resolve()
    if path.parent != root or not path.is_file():
        raise ValueError("Referência sintética indisponível.")
    return path
