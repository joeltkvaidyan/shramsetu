"""
Pydantic schemas for government-related API requests and responses.
Strict validation — no sensitive worker data exposed to government endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.government import GovernmentDepartment


class GovernmentLoginRequest(BaseModel):
    employee_id: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)


class GovernmentRegisterRequest(BaseModel):
    employee_id: str = Field(..., min_length=3, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    mobile_number: str = Field(..., pattern=r"^\d{10}$")
    password: str = Field(..., min_length=8, max_length=128)
    department: Optional[str] = None
    designation: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    is_superadmin: Optional[bool] = False


class GovernmentPublic(BaseModel):
    id: int
    employee_id: str
    full_name: str
    email: str
    mobile_number: str
    department: str
    designation: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    is_superadmin: bool
    created_at: str

    class Config:
        from_attributes = True

    @classmethod
    def from_model(cls, user):
        return cls(
            id=user.id,
            employee_id=user.employee_id,
            full_name=user.full_name,
            email=user.email,
            mobile_number=user.mobile_number,
            department=user.department.value if hasattr(user.department, 'value') else str(user.department),
            designation=user.designation,
            state=user.state,
            district=user.district,
            is_superadmin=user.is_superadmin,
            created_at=user.created_at.isoformat() if user.created_at else None,
        )


# ── Grievance management (government side) ──────────────────────────

class GrievanceCommentRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    is_internal: bool = False  # internal notes not visible to worker


class GrievanceStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern=r"^(submitted|under_review|resolved|rejected|withdrawn)$")
    note: Optional[str] = Field(None, max_length=1000)


class GrievanceAssignRequest(BaseModel):
    assignee_name: str = Field(..., min_length=2, max_length=200)
    assignee_department: Optional[str] = None
    note: Optional[str] = Field(None, max_length=1000)


# ── Push notification ───────────────────────────────────────────────

class NotificationSendRequest(BaseModel):
    title: str = Field(..., min_length=5, max_length=200)
    body: str = Field(..., min_length=10, max_length=2000)
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|urgent)$")
    target: str = Field(
        default="all",
        pattern=r"^(all|specific_workers|by_state|by_district|by_occupation)$",
    )
    target_value: Optional[str] = Field(None, max_length=500)
    is_broadcast: bool = False


class NotificationPublic(BaseModel):
    id: int
    title: str
    body: str
    priority: str
    target: str
    target_value: Optional[str] = None
    sender_name: str
    department: str
    is_broadcast: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Dashboard stats ─────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_workers: int
    active_workers: int
    total_grievances: int
    open_grievances: int
    resolved_grievances: int
    urgent_grievances: int
    grievances_by_category: dict
    grievances_by_status: dict
    recent_filings: list
    workers_by_state: dict
