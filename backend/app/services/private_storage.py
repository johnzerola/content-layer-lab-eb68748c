"""Private object storage for distributed CleanerIA jobs."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from minio import Minio
from minio.deleteobjects import DeleteObject

from ..config import get_settings


class PrivateStorage:
    """Small MinIO/S3 adapter used by CPU and GPU workers."""

    def __init__(self) -> None:
        settings = get_settings()
        endpoint = settings.minio_endpoint
        if endpoint.startswith("http://"):
            endpoint = endpoint.removeprefix("http://")
            secure = False
        elif endpoint.startswith("https://"):
            endpoint = endpoint.removeprefix("https://")
            secure = True
        else:
            secure = settings.minio_secure
        self.bucket = settings.minio_bucket
        self.client = Minio(
            endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=secure,
        )
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def put_file(self, local_path: str | Path, object_name: str, content_type: str = "application/octet-stream") -> str:
        source = Path(local_path)
        self.client.fput_object(
            self.bucket,
            object_name,
            str(source),
            content_type=content_type,
        )
        return object_name

    def get_file(self, object_name: str, local_path: str | Path) -> Path:
        destination = Path(local_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.client.fget_object(self.bucket, object_name, str(destination))
        return destination

    def delete_prefix(self, prefix: str) -> int:
        objects: Iterable[DeleteObject] = (
            DeleteObject(item.object_name)
            for item in self.client.list_objects(self.bucket, prefix=prefix, recursive=True)
        )
        removed = 0
        for error in self.client.remove_objects(self.bucket, objects):
            print(f"[storage] failed to remove {error.object_name}: {error}")
        for _ in self.client.list_objects(self.bucket, prefix=prefix, recursive=True):
            removed += 1
        return removed
