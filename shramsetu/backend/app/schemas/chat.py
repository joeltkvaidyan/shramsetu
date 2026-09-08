from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ChatQueryRequest(BaseModel):
    question: str
    language: str = "en"


class ChatAnswerResponse(BaseModel):
    answer: str
    simple_explanation: str
    source_document: Optional[str] = None
    government_department: Optional[str] = None
    confidence_score: float
    last_updated_date: Optional[str] = None
    grounded: bool  # False => "verified information unavailable"


class ChatHistoryItem(BaseModel):
    role: str
    content: str
    language: str
    created_at: datetime
    meta: Optional[dict] = None

    class Config:
        from_attributes = True
