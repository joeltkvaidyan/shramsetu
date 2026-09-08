import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_complaint_number() -> str:
    # e.g. GR-4F9A2C7B — human-shareable reference the worker can quote
    # when following up at a labour office, independent of the internal id.
    return f"GR-{uuid.uuid4().hex[:8].upper()}"


class GrievanceCategory(str, Enum):
    UNPAID_WAGES = "unpaid_wages"
    WORKPLACE_SAFETY = "workplace_safety"
    HARASSMENT_ABUSE = "harassment_abuse"
    ILLEGAL_TERMINATION = "illegal_termination"
    DOCUMENT_ISSUE = "document_issue"
    EMPLOYER_DISPUTE = "employer_dispute"
    INSURANCE_CLAIM = "insurance_claim"
    ACCOMMODATION = "accommodation"
    OTHER = "other"


class GrievancePriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class GrievanceStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class GrievancePriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    ESCALATED = "escalated"


class Grievance(SQLModel, table=True):
    """
    A worker-filed complaint/grievance. Phase 2 implements the full worker
    side (file, track, attach evidence, withdraw). Status can currently only
    move SUBMITTED -> WITHDRAWN by the worker; SUBMITTED -> UNDER_REVIEW ->
    RESOLVED/REJECTED transitions belong to the Government "Complaint
    Management" module, which is not yet built (that role has no auth yet —
    see roles.py). The schema already supports those states so that future
    phase doesn't require a breaking migration.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    complaint_number: str = Field(default_factory=_new_complaint_number, unique=True, index=True)
    owner_id: int = Field(foreign_key="user.id", index=True)

    category: GrievanceCategory = Field(index=True)
    subject: str
    description: str
    status: GrievanceStatus = Field(default=GrievanceStatus.SUBMITTED, index=True)
    priority: Optional[str] = Field(default="medium", index=True)

    employer_name: Optional[str] = None
    incident_location: Optional[str] = None
    incident_date: Optional[datetime] = None

    priority: GrievancePriority = Field(default=GrievancePriority.MEDIUM, index=True)

    # SLA tracking
    sla_days: int = Field(default=30)  # Expected resolution time in days
    sla_deadline: Optional[datetime] = None  # Auto-calculated from created_at + sla_days
    escalated: bool = Field(default=False)

    # Worker feedback after resolution
    worker_rating: Optional[int] = None  # 1-5 stars
    worker_feedback: Optional[str] = None
    feedback_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    resolved_at: Optional[datetime] = None
