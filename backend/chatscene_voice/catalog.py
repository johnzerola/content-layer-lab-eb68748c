"""Validated synthetic and authorized base-voice catalogs for ChatScene.

Catalog references are resolved only from reviewed manifests and fixed data
directories. Private per-account references remain handled by the account-
scoped UUID storage in ``service.py``.
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


def authorized_catalog_root(service_root: Path) -> Path:
    return Path(
        os.environ.get(
            "CHATSCENE_AUTHORIZED_CATALOG_DIR",
            str(service_root / "authorized-catalog"),
        )
    ).resolve()


def catalog_license_approved() -> bool:
    return (
        os.environ.get("CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED") == "1"
        or os.environ.get("CHATSCENE_AUTHORIZED_CATALOG_APPROVED") == "1"
    )


def _load_manifest(root: Path, expected_license: str, provenance: str) -> list[dict]:
    manifest = root / "catalog.json"
    raw = json.loads(manifest.read_text(encoding="utf-8"))
    if raw.get("schemaVersion") != 1 or raw.get("license") != expected_license:
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
                "provenance": provenance,
            }
        )
    return installed


def _catalog_sources(service_root: Path):
    return (
        (
            os.environ.get("CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED") == "1",
            catalog_root(service_root),
            "Apache-2.0",
            "synthetic",
        ),
        (
            os.environ.get("CHATSCENE_AUTHORIZED_CATALOG_APPROVED") == "1",
            authorized_catalog_root(service_root),
            "User-authorized",
            "authorized",
        ),
    )


def load_catalog(service_root: Path) -> list[dict]:
    """Return only installed, allowlisted and license-approved voices."""
    installed = []
    for approved, root, license_name, provenance in _catalog_sources(service_root):
        if not approved:
            continue
        try:
            installed.extend(_load_manifest(root, license_name, provenance))
        except (OSError, ValueError, TypeError, KeyError):
            continue
    return installed


def catalog_reference_path(service_root: Path, voice_id: str) -> Path:
    for approved, root, license_name, provenance in _catalog_sources(service_root):
        if not approved:
            continue
        try:
            installed = {voice["id"] for voice in _load_manifest(root, license_name, provenance)}
        except (OSError, ValueError, TypeError, KeyError):
            continue
        if voice_id in installed:
            return (root / f"{voice_id}.wav").resolve()
    raise ValueError("Esta voz do catálogo ainda não está instalada e aprovada.")
