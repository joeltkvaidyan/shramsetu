"""Offline behaviour tests for the RAG service.

The FAISS store and the Groq LLM are stubbed out, so these run fast and
without network. They pin the answer contract (which the frontend depends
on) and the citation provenance rules.
"""
import json
from types import SimpleNamespace

import pytest

import app.services.rag_service as rs


def _doc(meta_overrides=None, content="minimum wage body text"):
    meta = {
        "title": "Code on Wages, 2019 — Current Law on Minimum Wages",
        "department": "Ministry of Labour and Employment",
        "last_updated": "2026-10-01",
        "source_file": "code-on-wages-2019.txt",
        "chunk_index": 0,
        "authority": "Ministry of Labour and Employment",
        "source_url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2193095",
        "version": "v1",
        "last_verified": "2026-10-01",
    }
    if meta_overrides:
        meta.update(meta_overrides)
    return SimpleNamespace(metadata=meta, page_content=content)


class _FakeStore:
    def __init__(self, results):
        self._results = results

    def similarity_search_with_score(self, query, k):
        return self._results


class _FakeLLM:
    def __init__(self, payload):
        self.payload = payload
        self.last_messages = None

    def invoke(self, messages):
        self.last_messages = messages

        class _Resp:
            content = json.dumps(self.payload)

        return _Resp()


@pytest.fixture
def offline(monkeypatch):
    """Stub the vector store and LLM; keep translation (English passthrough)."""
    def _install(store_results, llm_payload):
        monkeypatch.setattr(rs, "_get_vector_store", lambda: _FakeStore(store_results))
        fake_llm = _FakeLLM(llm_payload)
        monkeypatch.setattr(rs, "_get_llm", lambda: fake_llm)
        return fake_llm
    return _install


def test_safe_parse_json_plain():
    assert rs._safe_parse_json('{"a": 1}') == {"a": 1}


def test_safe_parse_json_fenced():
    assert rs._safe_parse_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_safe_parse_json_embedded():
    assert rs._safe_parse_json('noise before {"a": 1} noise after') == {"a": 1}


def test_safe_parse_json_garbage_returns_none():
    assert rs._safe_parse_json("this is not json at all") is None


def test_source_citations_carry_provenance():
    scored = [
        (_doc(), 0.9),
        (_doc(), 0.85),  # duplicate title -> deduped
        (_doc({"title": "e-Shram Portal", "source_file": "e-shram-portal.txt"}), 0.8),
    ]
    cites = rs._source_citations(scored)
    assert len(cites) == 2
    first = cites[0]
    assert first["source_url"].startswith("https://www.pib.gov.in/")
    assert first["last_verified"] == "2026-10-01"
    assert first["source_file"] == "code-on-wages-2019.txt"


def test_no_info_response_contract_all_languages():
    for lang in ["en", "hi", "bn", "te", "ta", "ml"]:
        out = rs._no_info_response(lang)
        assert out["grounded"] is False
        assert out["system_error"] is False
        assert out["sources"] == []
        assert out["source_document"] is None
        assert "not legal advice" in out["answer"] or "सलाह" in out["answer"] \
            or "পরামর্শ" in out["answer"] or "సలహా" in out["answer"] \
            or "ஆலோசனை" in out["answer"] or "ഉപദേശമല്ല" in out["answer"]


def test_no_info_response_unknown_language_falls_back_to_english():
    out = rs._no_info_response("xx")
    assert "not legal advice" in out["answer"]


def test_error_response_contract():
    out = rs._error_response("en")
    assert out["system_error"] is True
    assert out["grounded"] is False
    assert out["sources"] == []


def test_format_context_never_contains_system_prompt():
    context = rs._format_context([(_doc(content="injected text"), 0.5)])
    assert "[Document 1:" in context
    assert rs.SYSTEM_PROMPT not in context


def test_grounded_answer_contract_and_disclaimer(offline):
    payload = {
        "answer": "Minimum wages are fixed under the Code on Wages, 2019.",
        "simple_explanation": "You must get at least the minimum wage.",
        "grounded": True,
        "confidence_note": "direct",
    }
    offline([(_doc(), 0.9)], payload)
    out = rs.answer_question("What is the minimum wage law?", "en")
    assert out["grounded"] is True
    assert out["system_error"] is False
    assert out["source_document"].startswith("Code on Wages, 2019")
    assert out["government_department"] == "Ministry of Labour and Employment"
    assert out["last_updated_date"] == "2026-10-01"
    assert out["sources"][0]["source_file"] == "code-on-wages-2019.txt"
    # The honesty disclaimer must be part of every substantive answer.
    assert "not legal advice" in out["answer"]
    # The plain answer text itself is preserved ahead of the disclaimer.
    assert out["answer"].startswith("Minimum wages are fixed")


def test_ungrounded_answer_falls_back_to_no_info(offline):
    payload = {
        "answer": "I could not find this in the documents.",
        "simple_explanation": "No information.",
        "grounded": False,
        "confidence_note": "weak",
    }
    offline([(_doc(), 0.9)], payload)
    out = rs.answer_question("Who won the cricket match?", "en")
    assert out["grounded"] is False
    assert out["sources"] == []
    assert "could not find" in out["answer"]
    assert "not legal advice" in out["answer"]


def test_prompt_requires_language_and_domain_rules(offline):
    payload = {"answer": "x", "simple_explanation": "y", "grounded": True}
    fake_llm = offline([(_doc(), 0.9)], payload)
    rs.answer_question("What is the minimum wage law?", "en")
    system_msg = fake_llm.last_messages[0][1]
    assert "MUST respond ENTIRELY" in system_msg
    assert "Never invent facts" in system_msg
