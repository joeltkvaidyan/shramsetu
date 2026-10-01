"""
Builds (or rebuilds) the FAISS vector index from the government documents in
rag/sample_docs/. Run standalone with:

    python -m rag.ingest

or it is called lazily by app.services.rag_service on first chatbot query if
no index is found on disk.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))  # allow `app.*` imports

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document as LCDocument

from app.core.config import settings
from rag.embeddings import NormalizedHuggingFaceEmbeddings
from rag.loader import load_all_documents, chunk_text


def build_index() -> FAISS:
    source_docs = load_all_documents(settings.RAG_SOURCE_DOCS_DIR)
    if not source_docs:
        raise RuntimeError(
            f"No source documents found in {settings.RAG_SOURCE_DOCS_DIR}. "
            "Add government welfare .txt documents before starting the chatbot."
        )

    lc_documents: list[LCDocument] = []
    import hashlib

    for doc in source_docs:
        # Content hash: lets operators detect that a document changed on disk
        # (re-index needed) and lets the API surface provenance.
        doc_hash = hashlib.sha256(doc.body.encode("utf-8")).hexdigest()[:16]
        for i, chunk in enumerate(chunk_text(doc.body)):
            lc_documents.append(
                LCDocument(
                    page_content=chunk,
                    metadata={
                        "title": doc.title,
                        "department": doc.department,
                        "last_updated": doc.last_updated,
                        "source_file": doc.filename,
                        "chunk_index": i,
                        # Full provenance (Phase 10):
                        "authority": doc.authority,
                        "source_url": doc.source_url,
                        "version": doc.version,
                        "published_date": doc.published_date,
                        "effective_date": doc.effective_date,
                        "last_verified": doc.last_verified,
                        "status": doc.status,
                        "content_hash": doc_hash,
                    },
                )
            )

    embeddings = NormalizedHuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
    index = FAISS.from_documents(lc_documents, embeddings)

    Path(settings.FAISS_INDEX_DIR).mkdir(parents=True, exist_ok=True)
    index.save_local(settings.FAISS_INDEX_DIR)
    return index


if __name__ == "__main__":
    idx = build_index()
    print(f"Index built with {idx.index.ntotal} vectors, saved to {settings.FAISS_INDEX_DIR}")
