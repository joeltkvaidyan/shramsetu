from typing import Optional

from sqlmodel import Session, select

from app.models.user import User


class UserRepository:
    """Encapsulates all direct DB access for User rows (Repository Pattern)."""

    def __init__(self, session: Session):
        self.session = session

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.session.get(User, user_id)

    def get_by_mobile(self, mobile_number: str) -> Optional[User]:
        stmt = select(User).where(User.mobile_number == mobile_number)
        return self.session.exec(stmt).first()

    def get_by_worker_id(self, worker_id: str) -> Optional[User]:
        stmt = select(User).where(User.worker_id == worker_id)
        return self.session.exec(stmt).first()

    def create(self, user: User) -> User:
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    def update(self, user: User) -> User:
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user
