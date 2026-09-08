from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GrievanceAttachment(SQLModel, table=True):
    """Evidence files (photos, PDFs) attached to a grievance. Uses the same
    StorageService abstraction as the document wallet, kept as a separate
    table since attachments belong to a complaint, not the general wallet."""

    id: Optional[int] = Field(default=None, primary_key=True)
    grievance_id: int = Field(foreign_key="grievance.id", index=True)
    owner_id: int = Field(foreign_key="user.id", index=True)

    original_filename: str
    storage_key: str
    content_type: str
    size_bytes: int

    created_at: datetime = Field(default_factory=_now)


class GrievanceStatusLog(SQLModel, table=True):
    """Append-only timeline of status changes shown to the worker, e.g.
    'Submitted' -> 'Withdrawn'. Future government-side transitions will
    append to this same log so the worker sees one unified history."""

    id: Optional[int] = Field(default=None, primary_key=True)
    grievance_id: int = Field(foreign_key="grievance.id", index=True)

    status: str
    note: Optional[str] = None
    changed_by: str = Field(default="worker")  # "worker" | "system" | future: "government"

    created_at: datetime = Field(default_factory=_now)


class GrievanceComment(SQLModel, table=True):
    """Comments on a grievance — from workers, government officials, or the system."""

    id: Optional[int] = Field(default=None, primary_key=True)
    grievance_id: int = Field(foreign_key="grievance.id", index=True)

    author_name: str
    author_role: str  # "worker", "government", "system"
    content: str
    is_internal: bool = Field(default=False)  # internal notes not visible to worker

    created_at: datetime = Field(default_factory=_now)
