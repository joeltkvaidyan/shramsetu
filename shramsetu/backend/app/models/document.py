from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Document(SQLModel, table=True):
    """
    Stores metadata only. Actual bytes live wherever `storage_service`
    decides (local disk in Phase 1). This separation is what lets us swap
    in S3/GCS later without touching this model or the API layer.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)

    display_name: str
    original_filename: str
    storage_key: str  # opaque key resolved by storage_service (local path today)
    content_type: str
    size_bytes: int

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
