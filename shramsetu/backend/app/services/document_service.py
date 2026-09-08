from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.models.document import Document
from app.repositories.document_repository import DocumentRepository
from app.services.storage_service import StorageService


class DocumentService:
    def __init__(self, repo: DocumentRepository, storage: StorageService):
        self.repo = repo
        self.storage = storage

    async def upload(self, owner_id: int, file: UploadFile, display_name: str | None) -> Document:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported file type '{ext}'. Allowed: {settings.ALLOWED_UPLOAD_EXTENSIONS}",
            )

        content = await file.read()
        size_mb = len(content) / (1024 * 1024)
        if size_mb > settings.MAX_UPLOAD_MB:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

        storage_key = self.storage.save(owner_id, file.filename or "upload", content)
        doc = Document(
            owner_id=owner_id,
            display_name=display_name or (file.filename or "Untitled"),
            original_filename=file.filename or "upload",
            storage_key=storage_key,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
        )
        return self.repo.create(doc)

    def list_documents(self, owner_id: int, limit: int = 20, offset: int = 0):
        return self.repo.list_for_owner(owner_id, limit=limit, offset=offset)

    def get_owned(self, owner_id: int, doc_id: int) -> Document:
        doc = self.repo.get(doc_id)
        if not doc or doc.owner_id != owner_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        return doc

    def rename(self, owner_id: int, doc_id: int, new_name: str) -> Document:
        doc = self.get_owned(owner_id, doc_id)
        doc.display_name = new_name
        from datetime import datetime, timezone

        doc.updated_at = datetime.now(timezone.utc)
        return self.repo.update(doc)

    def delete(self, owner_id: int, doc_id: int) -> None:
        doc = self.get_owned(owner_id, doc_id)
        self.storage.delete(doc.storage_key)
        self.repo.delete(doc)

    def download_response(self, owner_id: int, doc_id: int):
        doc = self.get_owned(owner_id, doc_id)
        return self.storage.build_download_response(doc.storage_key, doc.original_filename, doc.content_type)
