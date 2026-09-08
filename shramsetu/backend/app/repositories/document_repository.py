from typing import Optional, Sequence

from sqlmodel import Session, select

from app.models.document import Document


class DocumentRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_for_owner(self, owner_id: int, limit: int = 20, offset: int = 0) -> Sequence[Document]:
        stmt = (
            select(Document)
            .where(Document.owner_id == owner_id)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return self.session.exec(stmt).all()

    def get(self, doc_id: int) -> Optional[Document]:
        return self.session.get(Document, doc_id)

    def create(self, doc: Document) -> Document:
        self.session.add(doc)
        self.session.commit()
        self.session.refresh(doc)
        return doc

    def update(self, doc: Document) -> Document:
        self.session.add(doc)
        self.session.commit()
        self.session.refresh(doc)
        return doc

    def delete(self, doc: Document) -> None:
        self.session.delete(doc)
        self.session.commit()
