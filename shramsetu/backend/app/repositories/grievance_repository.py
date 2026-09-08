from typing import Optional, Sequence

from sqlmodel import Session, select

from app.models.grievance import Grievance
from app.models.grievance_extras import GrievanceAttachment, GrievanceComment, GrievanceStatusLog


class GrievanceRepository:
    def __init__(self, session: Session):
        self.session = session

    # --- Grievance ---
    def create(self, grievance: Grievance) -> Grievance:
        self.session.add(grievance)
        self.session.commit()
        self.session.refresh(grievance)
        return grievance

    def get(self, grievance_id: int) -> Optional[Grievance]:
        return self.session.get(Grievance, grievance_id)

    def list_for_owner(
        self,
        owner_id: int,
        status: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[Grievance]:
        stmt = select(Grievance).where(Grievance.owner_id == owner_id)
        if status:
            stmt = stmt.where(Grievance.status == status)
        if category:
            stmt = stmt.where(Grievance.category == category)
        # created_at is not indexed on its own, but every query here is
        # already scoped by the indexed owner_id (and often status/category,
        # also indexed), so the ORDER BY sorts a small, pre-filtered set
        # rather than the whole table.
        stmt = stmt.order_by(Grievance.created_at.desc()).limit(limit).offset(offset)
        return self.session.exec(stmt).all()

    def update(self, grievance: Grievance) -> Grievance:
        self.session.add(grievance)
        self.session.commit()
        self.session.refresh(grievance)
        return grievance

    # --- Attachments ---
    def add_attachment(self, attachment: GrievanceAttachment) -> GrievanceAttachment:
        self.session.add(attachment)
        self.session.commit()
        self.session.refresh(attachment)
        return attachment

    def list_attachments(self, grievance_id: int) -> Sequence[GrievanceAttachment]:
        stmt = select(GrievanceAttachment).where(GrievanceAttachment.grievance_id == grievance_id)
        return self.session.exec(stmt).all()

    def get_attachment(self, attachment_id: int) -> Optional[GrievanceAttachment]:
        return self.session.get(GrievanceAttachment, attachment_id)

    def delete_attachment(self, attachment: GrievanceAttachment) -> None:
        self.session.delete(attachment)
        self.session.commit()

    # --- Status log ---
    def add_status_log(self, log: GrievanceStatusLog) -> GrievanceStatusLog:
        self.session.add(log)
        self.session.commit()
        self.session.refresh(log)
        return log

    def list_status_log(self, grievance_id: int) -> Sequence[GrievanceStatusLog]:
        stmt = (
            select(GrievanceStatusLog)
            .where(GrievanceStatusLog.grievance_id == grievance_id)
            .order_by(GrievanceStatusLog.created_at.asc())
        )
        return self.session.exec(stmt).all()

    # --- Comments ---
    def add_comment(self, comment: GrievanceComment) -> GrievanceComment:
        self.session.add(comment)
        self.session.commit()
        self.session.refresh(comment)
        return comment

    def list_comments(self, grievance_id: int) -> Sequence[GrievanceComment]:
        stmt = (
            select(GrievanceComment)
            .where(GrievanceComment.grievance_id == grievance_id)
            .order_by(GrievanceComment.created_at.asc())
        )
        return self.session.exec(stmt).all()

    def delete_comment(self, comment: GrievanceComment) -> None:
        self.session.delete(comment)
        self.session.commit()
