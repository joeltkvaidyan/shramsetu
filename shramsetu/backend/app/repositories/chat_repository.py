from typing import Sequence

from sqlmodel import Session, select

from app.models.chat import ChatMessage


class ChatRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, message: ChatMessage) -> ChatMessage:
        self.session.add(message)
        self.session.commit()
        self.session.refresh(message)
        return message

    def history_for_owner(self, owner_id: int, limit: int = 50) -> Sequence[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.owner_id == owner_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        return list(reversed(self.session.exec(stmt).all()))

    def clear_for_owner(self, owner_id: int) -> int:
        """Delete all chat messages for the given user. Returns count of deleted rows."""
        stmt = select(ChatMessage).where(ChatMessage.owner_id == owner_id)
        messages = list(self.session.exec(stmt).all())
        count = len(messages)
        for msg in messages:
            self.session.delete(msg)
        self.session.commit()
        return count
