"""Tests for the translation cache.

The cache exists because machine translation is the slowest part of an Indic
request and, when the cloud keys are dead, the local fallback is not
deterministic. That non-determinism made the eval wobble between runs on
unchanged code, which is indefensible in a report, so translation now happens
once per (language, question) and is reused forever.
"""
from __future__ import annotations

import json

import pytest

from app.services import translation_service as ts


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Point the cache at a temp file and reset the in-memory layer."""
    monkeypatch.setattr(ts, "_CACHE_FILE", tmp_path / "cache.json")
    ts._MEM_CACHE.clear()
    yield
    ts._MEM_CACHE.clear()


def test_cache_key_depends_on_language_and_text():
    a = ts._cache_key("question", "hi")
    assert a == ts._cache_key("question", "hi")
    # Same text in two languages must not collide, or a Hindi answer would be
    # served for the Telugu question about the same words.
    assert a != ts._cache_key("question", "te")
    assert a != ts._cache_key("other", "hi")


def test_put_then_get_returns_the_same_translation():
    key = ts._cache_key("ప్రవాసీ కార్మికుల హక్కులు?", "te")
    ts._cache_put(key, "What are the rights of migrant workers?")
    assert ts._cache_get(key) == "What are the rights of migrant workers?"


def test_get_returns_none_for_an_unknown_question():
    assert ts._cache_get("never-stored") is None


def test_cache_survives_a_new_process(tmp_path):
    """The point of the disk layer: a re-run must not re-translate."""
    ts._CACHE_FILE = tmp_path / "cache.json"
    ts._MEM_CACHE.clear()
    ts._cache_put("k", "translated text")
    # Simulate a cold process: memory empty, disk remains.
    ts._MEM_CACHE.clear()
    assert ts._cache_get("k") == "translated text"


def test_corrupt_cache_file_is_ignored_not_fatal(tmp_path):
    """A cache is an optimisation; broken cache must never break translation."""
    bad = tmp_path / "cache.json"
    bad.write_text("{not valid json", encoding="utf-8")
    ts._CACHE_FILE = bad
    assert ts._cache_load() == {}
    assert ts._cache_get("anything") is None


def test_cache_file_is_not_a_secret_but_is_gitignored():
    """The cache holds user question text, so it must not be committed."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    ignore = (root / ".gitignore").read_text(encoding="utf-8")
    assert ".translation_cache.json" in ignore


def test_cached_value_must_be_a_non_empty_string(tmp_path):
    f = tmp_path / "cache.json"
    f.write_text(json.dumps({"a": "", "b": 5, "c": "ok"}), encoding="utf-8")
    ts._CACHE_FILE = f
    ts._MEM_CACHE.clear()
    assert ts._cache_get("a") is None
    assert ts._cache_get("b") is None
    assert ts._cache_get("c") == "ok"