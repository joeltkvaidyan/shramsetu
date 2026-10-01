"""Tests for rag/loader.py — header parsing and superseded-doc skipping."""
from rag.loader import parse_document_file, load_all_documents, chunk_text
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "rag" / "sample_docs"


def test_parse_document_file_reads_new_headers():
    doc = parse_document_file(DOCS / "code-on-wages-2019.txt")
    assert doc.title.startswith("Code on Wages, 2019")
    assert doc.status == "current"
    assert doc.source_url.startswith("https://www.pib.gov.in/")
    assert doc.last_verified == "2026-10-01"


def test_parse_superseded_doc_keeps_status():
    doc = parse_document_file(DOCS / "minimum-wages-act.txt")
    assert doc.status == "superseded"
    assert doc.last_verified == "2026-10-01"


def test_load_all_documents_skips_superseded():
    all_txt = sorted(DOCS.glob("*.txt"))
    docs = load_all_documents(str(DOCS))
    loaded_names = {d.filename for d in docs}
    assert len(loaded_names) == len(all_txt) - 11  # 11 docs are marked superseded
    assert "minimum-wages-act.txt" not in loaded_names
    assert "code-on-wages-2019.txt" in loaded_names


def test_load_all_documents_missing_dir_returns_empty():
    assert load_all_documents(str(DOCS.parent / "does-not-exist")) == []


def test_chunk_text_windows_overlap():
    words = [f"w{i}" for i in range(800)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size=700, overlap=120)
    assert len(chunks) >= 2
    first = chunks[0].split()
    second = chunks[1].split()
    assert first[:1] == ["w0"]
    # step = chunk_size - overlap = 580: chunk 2 starts at w580, and the
    # words w580..w699 appear in BOTH chunks (the overlap window).
    assert second[0] == "w580"
    assert "w580" in first
    assert "w699" in second


def test_chunk_text_empty_is_safe():
    assert chunk_text("") == []
