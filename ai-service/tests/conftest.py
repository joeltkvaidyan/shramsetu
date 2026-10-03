import json
import sys
from pathlib import Path

import pytest

# Make `app.*` and `rag.*` importable when pytest runs from anywhere.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def offline_stub(monkeypatch):
    """Stub the vector store and the Groq LLM, keeping translation as-is.

    Shared by test_prompt_injection.py and available to any test that needs
    the real answer_question() control flow without the ML stack or network.
    Returns the fake LLM so a test can assert on the messages it received.
    """
    import app.services.rag_service as rs

    class _Store:
        def __init__(self, results):
            self._results = results

        def similarity_search_with_score(self, query, k):
            return self._results

    class _LLM:
        def __init__(self, payload):
            self.payload = payload
            self.last_messages = None

        def invoke(self, messages):
            self.last_messages = messages

            class _Resp:
                content = json.dumps(self.payload)

            return _Resp()

    def _install(store_results, llm_payload):
        monkeypatch.setattr(rs, "_get_vector_store", lambda: _Store(store_results))
        fake_llm = _LLM(llm_payload)
        monkeypatch.setattr(rs, "_get_llm", lambda: fake_llm)
        # retrieve_documents() consults the BM25 lexical index, which would
        # otherwise be built from the FAKE store and cache a failure in a
        # module-level global for the rest of the session. Dense-only is the
        # honest configuration for these tests.
        monkeypatch.setattr(rs, "_get_bm25", lambda: None)
        return fake_llm

    return _install
