from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.grievance import Grievance, GrievanceCategory, GrievanceStatus
from app.models.grievance_extras import GrievanceComment, GrievanceStatusLog
from app.repositories.grievance_repository import GrievanceRepository
from app.schemas.grievance import (
    GrievanceCommentCreate,
    GrievanceCommentPublic,
    GrievanceCreateRequest,
    GrievanceDetail,
    GrievanceFeedbackRequest,
    GrievancePublic,
    GrievanceWithdrawRequest,
    GovernmentStatusUpdateRequest,
)
from app.services.grievance_service import GrievanceService
from app.services.storage_service import get_storage_service

router = APIRouter(prefix="/grievances", tags=["Grievances"])


def _service(session: SessionDep) -> GrievanceService:
    return GrievanceService(GrievanceRepository(session), get_storage_service())


@router.get("/categories")
def list_categories():
    return {"categories": [c.value for c in GrievanceCategory]}


@router.post("", response_model=GrievancePublic, status_code=201)
def file_grievance(payload: GrievanceCreateRequest, session: SessionDep, current_user: CurrentUser):
    return _service(session).file_grievance(current_user, payload)


@router.get("", response_model=List[GrievancePublic])
def list_grievances(
    session: SessionDep,
    current_user: CurrentUser,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
):
    from app.core.config import settings

    limit = max(1, min(limit, settings.MAX_PAGE_SIZE))
    offset = max(0, offset)
    return _service(session).list_grievances(current_user.id, status, category, limit=limit, offset=offset)


@router.get("/{grievance_id}", response_model=GrievanceDetail)
def get_grievance(grievance_id: int, session: SessionDep, current_user: CurrentUser):
    g, attachments, timeline = _service(session).get_detail(current_user.id, grievance_id)
    data = GrievancePublic.model_validate(g).model_dump()
    data["attachments"] = attachments
    data["timeline"] = timeline
    data["comments"] = [GrievanceCommentPublic.model_validate(c).model_dump() for c in _service(session).get_comments(current_user.id, grievance_id)]
    return data


@router.post("/{grievance_id}/comments", status_code=201)
def add_comment(
    grievance_id: int, payload: GrievanceCommentCreate, session: SessionDep, current_user: CurrentUser
):
    """Worker adds a comment to their grievance."""
    comment = _service(session).add_comment(
        current_user.id, grievance_id, payload.content,
        author_role="worker", author_name=current_user.full_name
    )
    return GrievanceCommentPublic.model_validate(comment).model_dump()


@router.post("/{grievance_id}/feedback", response_model=GrievancePublic)
def submit_feedback(
    grievance_id: int, payload: GrievanceFeedbackRequest, session: SessionDep, current_user: CurrentUser
):
    """Worker submits feedback/rating for a resolved grievance."""
    return _service(session).submit_feedback(current_user.id, grievance_id, payload.rating, payload.feedback)


@router.post("/{grievance_id}/attachments", status_code=201)
async def upload_attachment(
    grievance_id: int, session: SessionDep, current_user: CurrentUser, file: UploadFile = File(...)
):
    attachment = await _service(session).add_attachment(current_user.id, grievance_id, file)
    return {
        "id": attachment.id,
        "original_filename": attachment.original_filename,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "created_at": attachment.created_at,
    }


@router.get("/{grievance_id}/attachments/{attachment_id}/download")
def download_attachment(grievance_id: int, attachment_id: int, session: SessionDep, current_user: CurrentUser):
    return _service(session).attachment_download_response(current_user.id, grievance_id, attachment_id)


@router.delete("/{grievance_id}/attachments/{attachment_id}", status_code=204)
def delete_attachment(grievance_id: int, attachment_id: int, session: SessionDep, current_user: CurrentUser):
    _service(session).delete_attachment(current_user.id, grievance_id, attachment_id)


@router.post("/{grievance_id}/withdraw", response_model=GrievancePublic)
def withdraw_grievance(
    grievance_id: int, payload: GrievanceWithdrawRequest, session: SessionDep, current_user: CurrentUser
):
    return _service(session).withdraw(current_user.id, grievance_id, payload.reason)


# ── Government endpoints ──────────────────────────────────────────────


@router.get("/government/all", response_model=List[GrievancePublic])
def government_list_all_grievances(
    session: SessionDep,
    current_user: CurrentUser,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Government officials can view ALL grievances from all workers."""
    from app.core.config import settings

    limit = max(1, min(limit, settings.MAX_PAGE_SIZE))
    offset = max(0, offset)
    repo = GrievanceRepository(session)
    stmt = select(Grievance)
    if status:
        # Convert string to enum for comparison
        try:
            status_enum = GrievanceStatus(status)
            stmt = stmt.where(Grievance.status == status_enum)
        except ValueError:
            pass
    if category:
        try:
            cat_enum = GrievanceCategory(category)
            stmt = stmt.where(Grievance.category == cat_enum)
        except ValueError:
            pass
    stmt = stmt.order_by(Grievance.created_at.desc()).limit(limit).offset(offset)
    return list(session.exec(stmt).all())


@router.get("/government/stats")
def government_stats(session: SessionDep, current_user: CurrentUser):
    """Return counts of grievances by status for the dashboard."""
    from sqlmodel import func

    stmt = select(Grievance.status, func.count()).group_by(Grievance.status)
    rows = list(session.exec(stmt).all())
    # Convert enum values to strings for JSON serialization
    return {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in rows}


@router.get("/government/{grievance_id}", response_model=GrievanceDetail)
def government_get_grievance(
    grievance_id: int, session: SessionDep, current_user: CurrentUser
):
    """Government can view any grievance's full details."""
    repo = GrievanceRepository(session)
    g = repo.get(grievance_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    attachments = repo.list_attachments(g.id)
    timeline = repo.list_status_log(g.id)
    comments = repo.list_comments(g.id)
    data = GrievancePublic.model_validate(g).model_dump()
    data["attachments"] = attachments
    data["timeline"] = timeline
    data["comments"] = [GrievanceCommentPublic.model_validate(c).model_dump() for c in comments]
    return data


@router.post("/government/{grievance_id}/status", response_model=GrievancePublic)
def government_update_status(
    grievance_id: int,
    payload: GovernmentStatusUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser,
):
    """Government officials can update complaint status (review, resolve, reject)."""
    from datetime import datetime, timezone

    repo = GrievanceRepository(session)
    g = repo.get(grievance_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")

    new_status = GrievanceStatus(payload.status)
    valid_transitions = {
        GrievanceStatus.SUBMITTED: [GrievanceStatus.UNDER_REVIEW, GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED],
        GrievanceStatus.UNDER_REVIEW: [GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED],
    }
    allowed = valid_transitions.get(g.status, [])
    if new_status not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot transition from '{g.status.value}' to '{new_status.value}"
        )

    g.status = new_status
    g.updated_at = datetime.now(timezone.utc)
    if new_status == GrievanceStatus.RESOLVED:
        g.resolved_at = datetime.now(timezone.utc)
    g = repo.update(g)

    repo.add_status_log(
        GrievanceStatusLog(
            grievance_id=g.id,
            status=new_status.value,
            note=payload.note or f"Status changed to {new_status.value} by government official",
            changed_by="government",
        )
    )
    return g


@router.post("/government/{grievance_id}/comments", status_code=201)
def government_add_comment(
    grievance_id: int, payload: GrievanceCommentCreate, session: SessionDep, current_user: CurrentUser
):
    """Government official adds a comment to a grievance."""
    repo = GrievanceRepository(session)
    g = repo.get(grievance_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    
    comment = GrievanceComment(
        grievance_id=grievance_id,
        user_id=current_user.id,
        content=payload.content,
        author_role="government",
        author_name=current_user.full_name,
    )
    comment = repo.add_comment(comment)
    return GrievanceCommentPublic.model_validate(comment).model_dump()


@router.post("/government/escalate")
def escalate_overdue(session: SessionDep, current_user: CurrentUser):
    """Trigger escalation check for overdue grievances. Can be called manually or by cron."""
    service = _service(session)
    escalated = service.check_escalations()
    return {"escalated_count": len(escalated), "escalated_ids": escalated}


@router.get("/government/search")
def government_search_grievances(
    session: SessionDep,
    current_user: CurrentUser,
    q: str = "",
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Search and filter grievances with full-text search."""
    from app.core.config import settings
    from sqlmodel import or_

    limit = max(1, min(limit, settings.MAX_PAGE_SIZE))
    offset = max(0, offset)
    repo = GrievanceRepository(session)
    stmt = select(Grievance)
    
    if q:
        stmt = stmt.where(
            or_(
                Grievance.subject.contains(q),
                Grievance.description.contains(q),
                Grievance.complaint_number.contains(q),
                Grievance.employer_name.contains(q),
            )
        )
    if status:
        try:
            stmt = stmt.where(Grievance.status == GrievanceStatus(status))
        except ValueError:
            pass
    if category:
        try:
            stmt = stmt.where(Grievance.category == GrievanceCategory(category))
        except ValueError:
            pass
    if priority:
        try:
            stmt = stmt.where(Grievance.priority == priority)
        except ValueError:
            pass
    
    stmt = stmt.order_by(Grievance.created_at.desc()).limit(limit).offset(offset)
    return list(session.exec(stmt).all())
