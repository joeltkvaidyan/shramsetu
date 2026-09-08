"""
File storage abstraction.

Two backends, selected via STORAGE_BACKEND:
  - "local" (default): writes to local disk. Zero-config, fine for dev and
    for single-instance deployments with a persistent volume (the provided
    docker-compose.yml mounts one).
  - "s3": any S3-compatible object store — real AWS S3, or free-tier
    S3-compatible services like Cloudflare R2 (10GB free) or Backblaze B2.
    This is the recommended production backend: durable, works across
    multiple app instances/restarts, and downloads are served via
    short-lived signed URLs instead of routing file bytes through the API
    process.

Both backends implement the same interface, so nothing above this layer
(routes, services) needs to know which one is active.
"""
from __future__ import annotations

import logging
import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from fastapi.responses import FileResponse, RedirectResponse, Response

from app.core.config import settings

logger = logging.getLogger("shramsetu.storage")


class StorageService(ABC):
    @abstractmethod
    def save(self, owner_id: int, filename: str, content: bytes) -> str:
        """Persist bytes, return an opaque storage_key."""

    @abstractmethod
    def delete(self, storage_key: str) -> None: ...

    @abstractmethod
    def build_download_response(self, storage_key: str, filename: str, content_type: str) -> Response:
        """Returns the appropriate response for serving this file: a
        streamed FileResponse for local disk, or a redirect to a
        short-lived signed URL for cloud storage."""


class LocalStorageService(StorageService):
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _owner_dir(self, owner_id: int) -> Path:
        d = self.base_dir / str(owner_id)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save(self, owner_id: int, filename: str, content: bytes) -> str:
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = self._owner_dir(owner_id) / unique_name
        with open(dest, "wb") as f:
            f.write(content)
        # storage_key is relative to base_dir so it stays portable
        return str(Path(str(owner_id)) / unique_name)

    def delete(self, storage_key: str) -> None:
        path = self.base_dir / storage_key
        if path.exists():
            os.remove(path)

    def build_download_response(self, storage_key: str, filename: str, content_type: str) -> Response:
        absolute_path = str(self.base_dir / storage_key)
        return FileResponse(absolute_path, media_type=content_type, filename=filename)


class S3StorageService(StorageService):
    """Works with AWS S3 or any S3-compatible endpoint (Cloudflare R2,
    Backblaze B2, MinIO for self-hosting, etc) via boto3's standard S3 API."""

    def __init__(self):
        import boto3

        self.bucket = settings.S3_BUCKET_NAME
        if not self.bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 requires S3_BUCKET_NAME to be set")

        client_kwargs = {"region_name": settings.S3_REGION}
        if settings.S3_ENDPOINT_URL:
            client_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        if settings.S3_ACCESS_KEY_ID:
            client_kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY

        self.client = boto3.client("s3", **client_kwargs)

    def save(self, owner_id: int, filename: str, content: bytes) -> str:
        ext = Path(filename).suffix
        key = f"{owner_id}/{uuid.uuid4().hex}{ext}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content)
        return key

    def delete(self, storage_key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=storage_key)
        except Exception:
            logger.exception("Failed to delete S3 object %s", storage_key)

    def build_download_response(self, storage_key: str, filename: str, content_type: str) -> Response:
        url = self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": storage_key,
                "ResponseContentType": content_type,
                "ResponseContentDisposition": f'attachment; filename="{filename}"',
            },
            ExpiresIn=settings.S3_PRESIGNED_URL_EXPIRY_SECONDS,
        )
        return RedirectResponse(url, status_code=307)


_storage_singleton: StorageService | None = None


def get_storage_service() -> StorageService:
    global _storage_singleton
    if _storage_singleton is None:
        if settings.STORAGE_BACKEND == "s3":
            _storage_singleton = S3StorageService()
        else:
            _storage_singleton = LocalStorageService(settings.UPLOAD_DIR)
    return _storage_singleton
