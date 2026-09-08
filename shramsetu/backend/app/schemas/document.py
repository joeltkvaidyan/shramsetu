from datetime import datetime

from pydantic import BaseModel


class DocumentPublic(BaseModel):
    id: int
    display_name: str
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentRenameRequest(BaseModel):
    display_name: str
