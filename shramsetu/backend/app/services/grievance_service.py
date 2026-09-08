from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.models.grievance import Grievance, GrievancePriority, GrievanceStatus
from app.models.grievance_extras import GrievanceAttachment, GrievanceComment, GrievanceStatusLog
from app.models.user import User
from app.repositories.grievance_repository import GrievanceRepository
from app.schemas.grievance import GrievanceCreateRequest
from app.services import notification_service
from app.services.storage_service import StorageService

# Priority-based SLA days
PRIORITY_SLA = {
    "urgent": 7,
    "high": 14,
    "medium": 30,
    "low": 60,
}

# Category-based default priority
CATEGORY_PRIORITY = {
    "unpaid_wages": "high",
    "workplace_safety": "urgent",
    "harassment_abuse": "urgent",
    "illegal_termination": "high",
    "document_issue": "medium",
    "employer_dispute": "medium",
    "insurance_claim": "medium",
    "accommodation": "low",
    "other": "medium",
}

# Attachments reuse the same allow-list as the document wallet.
ALLOWED_ATTACHMENT_EXTENSIONS = settings.ALLOWED_UPLOAD_EXTENSIONS
MAX_ATTACHMENTS_PER_GRIEVANCE = 5


class GrievanceService:
    def __init__(self, repo: GrievanceRepository, storage: StorageService):
        self.repo = repo
        self.storage = storage

    def file_grievance(self, worker: User, payload: GrievanceCreateRequest) -> Grievance:
        # Determine priority
        priority = payload.priority or CATEGORY_PRIORITY.get(payload.category.value, "medium")
        if isinstance(priority, str):
            try:
                priority_enum = GrievancePriority(priority)
            except ValueError:
                priority_enum = GrievancePriority.MEDIUM
        else:
            priority_enum = priority

        # Calculate SLA deadline
        from datetime import datetime, timedelta, timezone
        sla_days = PRIORITY_SLA.get(priority_enum.value, 30)
        created_at = datetime.now(timezone.utc)
        sla_deadline = created_at + timedelta(days=sla_days)

        grievance = Grievance(
            owner_id=worker.id,
            category=payload.category,
            subject=payload.subject,
            description=payload.description,
            employer_name=payload.employer_name,
            incident_location=payload.incident_location,
            incident_date=payload.incident_date,
            priority=priority_enum,
            sla_days=sla_days,
            sla_deadline=sla_deadline,
        )
        grievance = self.repo.create(grievance)
        self.repo.add_status_log(
            GrievanceStatusLog(
                grievance_id=grievance.id,
                status=GrievanceStatus.SUBMITTED.value,
                note=f"Complaint filed by worker. Priority: {priority_enum.value.upper()}, SLA: {sla_days} days",
                changed_by="worker",
            )
        )

        notified = notification_service.notify_authorities(grievance, worker)
        if notified:
            self.repo.add_status_log(
                GrievanceStatusLog(
                    grievance_id=grievance.id,
                    status=GrievanceStatus.SUBMITTED.value,
                    note=f"Forwarded to: {', '.join(notified)}",
                    changed_by="system",
                )
            )
        return grievance

    def list_grievances(self, owner_id: int, status_filter: str | None, category_filter: str | None, limit: int = 20, offset: int = 0):
        return self.repo.list_for_owner(owner_id, status_filter, category_filter, limit=limit, offset=offset)

    def get_owned(self, owner_id: int, grievance_id: int) -> Grievance:
        g = self.repo.get(grievance_id)
        if not g or g.owner_id != owner_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
        return g

    def get_detail(self, owner_id: int, grievance_id: int):
        g = self.get_owned(owner_id, grievance_id)
        attachments = self.repo.list_attachments(g.id)
        timeline = self.repo.list_status_log(g.id)
        return g, attachments, timeline

    async def add_attachment(self, owner_id: int, grievance_id: int, file: UploadFile) -> GrievanceAttachment:
        g = self.get_owned(owner_id, grievance_id)
        if g.status in (GrievanceStatus.WITHDRAWN, GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add evidence to a closed complaint")

        existing = self.repo.list_attachments(grievance_id)
        if len(existing) >= MAX_ATTACHMENTS_PER_GRIEVANCE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Maximum {MAX_ATTACHMENTS_PER_GRIEVANCE} attachments per complaint"
            )

        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported file type '{ext}'. Allowed: {ALLOWED_ATTACHMENT_EXTENSIONS}",
            )

        content = await file.read()
        size_mb = len(content) / (1024 * 1024)
        if size_mb > settings.MAX_UPLOAD_MB:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

        storage_key = self.storage.save(owner_id, file.filename or "evidence", content)
        attachment = GrievanceAttachment(
            grievance_id=grievance_id,
            owner_id=owner_id,
            original_filename=file.filename or "evidence",
            storage_key=storage_key,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
        )
        return self.repo.add_attachment(attachment)

    def delete_attachment(self, owner_id: int, grievance_id: int, attachment_id: int) -> None:
        self.get_owned(owner_id, grievance_id)  # ownership check
        attachment = self.repo.get_attachment(attachment_id)
        if not attachment or attachment.grievance_id != grievance_id or attachment.owner_id != owner_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
        self.storage.delete(attachment.storage_key)
        self.repo.delete_attachment(attachment)

    def attachment_download_response(self, owner_id: int, grievance_id: int, attachment_id: int):
        self.get_owned(owner_id, grievance_id)
        attachment = self.repo.get_attachment(attachment_id)
        if not attachment or attachment.grievance_id != grievance_id or attachment.owner_id != owner_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
        return self.storage.build_download_response(
            attachment.storage_key, attachment.original_filename, attachment.content_type
        )

    def withdraw(self, owner_id: int, grievance_id: int, reason: str | None) -> Grievance:
        g = self.get_owned(owner_id, grievance_id)
        if g.status in (GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED, GrievanceStatus.WITHDRAWN):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot withdraw a complaint that is {g.status.value}")

        g.status = GrievanceStatus.WITHDRAWN
        g.updated_at = datetime.now(timezone.utc)
        g = self.repo.update(g)
        self.repo.add_status_log(
            GrievanceStatusLog(
                grievance_id=g.id,
                status=GrievanceStatus.WITHDRAWN.value,
                note=reason or "Withdrawn by worker",
                changed_by="worker",
            )
        )
        return g

    def add_comment(self, owner_id: int, grievance_id: int, content: str, author_role: str = "worker", author_name: str | None = None) -> GrievanceComment:
        g = self.get_owned(owner_id, grievance_id)
        if g.status in (GrievanceStatus.WITHDRAWN,):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot comment on a withdrawn complaint")

        comment = GrievanceComment(
            grievance_id=grievance_id,
            user_id=owner_id,
            content=content,
            author_role=author_role,
            author_name=author_name,
        )
        return self.repo.add_comment(comment)

    def get_comments(self, owner_id: int, grievance_id: int) -> list:
        g = self.get_owned(owner_id, grievance_id)
        return self.repo.list_comments(grievance_id)

    def submit_feedback(self, owner_id: int, grievance_id: int, rating: int, feedback: str | None) -> Grievance:
        g = self.get_owned(owner_id, grievance_id)
        if g.status != GrievanceStatus.RESOLVED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Feedback can only be submitted for resolved complaints")
        if g.worker_rating is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Feedback already submitted for this complaint")

        g.worker_rating = rating
        g.worker_feedback = feedback
        g.feedback_at = datetime.now(timezone.utc)
        g.updated_at = datetime.now(timezone.utc)
        return self.repo.update(g)

    def check_escalations(self) -> list[int]:
        """Check for overdue grievances and escalate them. Returns list of escalated grievance IDs."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        escalated_ids = []
        
        # Find grievances that are past their SLA deadline and not yet escalated
        from sqlmodel import select
        stmt = select(Grievance).where(
            Grievance.status.in_([GrievanceStatus.SUBMITTED, GrievanceStatus.UNDER_REVIEW]),
            Grievance.escalated == False,
            Grievance.sla_deadline != None,
            Grievance.sla_deadline < now
        )
        overdue = list(self.repo.session.exec(stmt).all())
        
        for g in overdue:
            g.escalated = True
            g.priority = GrievancePriority.URGENT
            g.updated_at = now
            self.repo.update(g)
            self.repo.add_status_log(
                GrievanceStatusLog(
                    grievance_id=g.id,
                    status=GrievanceStatus.ESCALATED.value,
                    note=f"Auto-escalated: SLA deadline ({g.sla_deadline.strftime('%Y-%m-%d')}) exceeded",
                    changed_by="system",
                )
            )
            escalated_ids.append(g.id)
        
        return escalated_ids
