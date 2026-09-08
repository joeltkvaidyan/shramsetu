"""Parses the plain-text government documents used to seed the RAG index.

File format (see sample_docs/*.txt):
    TITLE: ...
    DEPARTMENT: ...
    LAST_UPDATED: YYYY-MM-DD
    ---
    <body text>

This is intentionally simple/free of dependencies so any government
department document can be dropped into sample_docs/ as a .txt file and
picked up automatically on next index rebuild.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class SourceDocument:
    title: str
    department: str
    last_updated: str
    body: str
    filename: str


def parse_document_file(path: Path) -> SourceDocument:
    text = path.read_text(encoding="utf-8")
    header, _, body = text.partition("---")
    meta: dict[str, str] = {}
    for line in header.strip().splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            meta[key.strip().upper()] = val.strip()

    return SourceDocument(
        title=meta.get("TITLE", path.stem),
        department=meta.get("DEPARTMENT", "Unknown Department"),
        last_updated=meta.get("LAST_UPDATED", "Unknown"),
        body=body.strip(),
        filename=path.name,
    )


def load_all_documents(source_dir: str) -> List[SourceDocument]:
    docs: List[SourceDocument] = []
    src = Path(source_dir)
    if not src.exists():
        return docs
    for path in sorted(src.glob("*.txt")):
        docs.append(parse_document_file(path))
    return docs


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 120) -> List[str]:
    """Simple word-based sliding-window chunker (dependency-free)."""
    words = text.split()
    if not words:
        return []
    chunks = []
    step = max(chunk_size - overlap, 1)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_size])
        if chunk:
            chunks.append(chunk)
        if start + chunk_size >= len(words):
            break
    return chunks
