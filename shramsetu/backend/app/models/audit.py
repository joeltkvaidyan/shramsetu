"""
Audit log — immutable record of every sensitive operation.
Used for compliance, incident response, and data-leak detection.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AuditLog(SQLModel, table=True):
    """
    Append-only audit trail. Every login, data access, grievance action,
    notification send, and admin operation is logged here.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now, index=True)
    actor_id: Optional[int] = None  # user ID (worker or government)
    actor_role: str  # "worker", "government", "system"
    actor_identifier: str  # mobile number or employee_id
    action: str  # e.g. "login", "view_grievance", "send_notification", "export_data"
    resource_type: Optional[str] = None  # "grievance", "document", "worker", "notification"
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[str] = None  # JSON string for additional context
    success: bool = True
    failure_reason: Optional[str] = None
