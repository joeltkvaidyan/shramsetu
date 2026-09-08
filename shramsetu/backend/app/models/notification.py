"""
Push notification model — government officials can send notifications to workers.
Supports targeting: all workers, specific workers, workers by state/district/category.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class NotificationPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class NotificationTarget(str, Enum):
    ALL = "all"
    SPECIFIC_WORKERS = "specific_workers"
    BY_STATE = "by_state"
    BY_DISTRICT = "by_district"
    BY_OCCUPATION = "by_occupation"


class PushNotification(SQLModel, table=True):
    """
    A notification sent by a government official to workers.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    body: str
    priority: NotificationPriority = Field(default=NotificationPriority.MEDIUM)
    target: NotificationTarget = Field(default=NotificationTarget.ALL)
    target_value: Optional[str] = None  # state name, district, occupation, or comma-separated worker IDs
    sender_id: int = Field(index=True)  # GovernmentUser.id
    sender_name: str
    department: str
    is_broadcast: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_now)


class WorkerNotification(SQLModel, table=True):
    """
    Per-worker notification record — tracks which worker received which notification.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    notification_id: int = Field(index=True)
    worker_id: int = Field(index=True)
    is_read: bool = Field(default=False)
    read_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)
