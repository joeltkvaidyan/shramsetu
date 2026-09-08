from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile

from app.api.deps import CurrentUser, SessionDep
from app.repositories.document_repository import DocumentRepository
from app.schemas.document import DocumentPublic, DocumentRenameRequest
from app.services.document_service import DocumentService
from app.services.storage_service import get_storage_service

router = APIRouter(prefix="/documents", tags=["Document Wallet"])


def _service(session: SessionDep) -> DocumentService:
    return DocumentService(DocumentRepository(session), get_storage_service())


@router.get("", response_model=List[DocumentPublic])
def list_documents(session: SessionDep, current_user: CurrentUser, limit: int = 20, offset: int = 0):
    from app.core.config import settings

    limit = max(1, min(limit, settings.MAX_PAGE_SIZE))
    offset = max(0, offset)
    return _service(session).list_documents(current_user.id, limit=limit, offset=offset)


@router.post("", response_model=DocumentPublic, status_code=201)
async def upload_document(
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None),
):
    return await _service(session).upload(current_user.id, file, display_name)


@router.get("/{doc_id}/download")
def download_document(doc_id: int, session: SessionDep, current_user: CurrentUser):
    return _service(session).download_response(current_user.id, doc_id)


@router.patch("/{doc_id}", response_model=DocumentPublic)
def rename_document(doc_id: int, payload: DocumentRenameRequest, session: SessionDep, current_user: CurrentUser):
    return _service(session).rename(current_user.id, doc_id, payload.display_name)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: int, session: SessionDep, current_user: CurrentUser):
    _service(session).delete(current_user.id, doc_id)
