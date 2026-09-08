from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)

    role: str  # "user" | "assistant"
    language: str
    content: str  # for assistant: the "answer" field; full payload stored in meta_json

    # Structured RAG metadata (JSON-encoded) for assistant messages:
    # simple_explanation, source_document, government_department,
    # confidence_score, last_updated_date, grounded (bool)
    meta_json: Optional[str] = None

    created_at: datetime = Field(default_factory=_now)
