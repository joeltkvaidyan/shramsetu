from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.models.grievance import GrievanceCategory, GrievanceStatus


class GrievanceCreateRequest(BaseModel):
    category: GrievanceCategory
    subject: str
    description: str
    employer_name: Optional[str] = None
    incident_location: Optional[str] = None
    incident_date: Optional[datetime] = None
    priority: Optional[str] = None  # low, medium, high, urgent

    @field_validator("subject")
    @classmethod
    def subject_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Subject is required")
        if len(v) > 200:
            raise ValueError("Subject must be under 200 characters")
        return v.strip()

    @field_validator("description")
    @classmethod
    def description_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Description is required")
        return v.strip()


class GrievanceAttachmentPublic(BaseModel):
    id: int
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


class GrievanceStatusLogPublic(BaseModel):
    status: str
    note: Optional[str] = None
    changed_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class GrievancePublic(BaseModel):
    id: int
    complaint_number: str
    category: GrievanceCategory
    subject: str
    description: str
    status: GrievanceStatus
    priority: str = "medium"
    employer_name: Optional[str] = None
    incident_location: Optional[str] = None
    incident_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    sla_days: int = 30
    sla_deadline: Optional[datetime] = None
    escalated: bool = False
    worker_rating: Optional[int] = None
    worker_feedback: Optional[str] = None
    feedback_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GrievanceCommentPublic(BaseModel):
    id: int
    grievance_id: int
    user_id: int
    content: str
    author_role: str
    author_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class GrievanceDetail(GrievancePublic):
    attachments: List[GrievanceAttachmentPublic] = []
    timeline: List[GrievanceStatusLogPublic] = []
    comments: List[GrievanceCommentPublic] = []


class GrievanceWithdrawRequest(BaseModel):
    reason: Optional[str] = None


class GovernmentStatusUpdateRequest(BaseModel):
    status: str  # under_review, resolved, rejected
    note: Optional[str] = None
    priority: Optional[str] = None  # Allow government to change priority
    sla_days: Optional[int] = None  # Allow government to change SLA


class GrievanceCommentCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment cannot be empty")
        if len(v) > 2000:
            raise ValueError("Comment must be under 2000 characters")
        return v.strip()


class GrievanceFeedbackRequest(BaseModel):
    rating: int  # 1-5
    feedback: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def rating_in_range(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Rating must be between 1 and 5")
        return v
