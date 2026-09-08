"""
Government official model — separate from Worker to enforce strict data isolation.
Government users can view grievances, manage cases, and push notifications to workers.
They CANNOT access worker personal data (Aadhaar, address, etc.) unless explicitly
viewing a specific grievance case.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GovernmentDepartment(str, Enum):
    LABOUR = "labour"
    POLICE = "police"
    SOCIAL_WELFARE = "social_welfare"
    FOOD_CIVIL_SUPPLIES = "food_civil_supplies"
    EMPLOYMENT = "employment"
    SKILL_DEVELOPMENT = "skill_development"
    HEALTH = "health"
    GENERAL = "general"


class GovernmentUser(SQLModel, table=True):
    """
    Government official account — strictly read-only on worker PII.
    Can manage grievances and push notifications.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: str = Field(unique=True, index=True)  # e.g. GOV-LAB-00123
    full_name: str
    email: str = Field(unique=True, index=True)
    mobile_number: str = Field(unique=True, index=True)
    password_hash: str
    department: GovernmentDepartment = Field(default=GovernmentDepartment.GENERAL)
    designation: Optional[str] = None  # e.g. "Labour Inspector", "DCP"
    state: Optional[str] = None
    district: Optional[str] = None
    is_active: bool = Field(default=True)
    is_superadmin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
