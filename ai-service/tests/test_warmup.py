"""Cold-start reliability: does the service tell the truth about warming?

The regression these tests exist to prevent is subtle and expensive: /health used
to return a constant {"status": "ok"} the instant uvicorn bound the port, while
the embedding model and FAISS index were still loading in a background thread.
A green health check then meant "a port is open", not "the chatbot can answer" —
which is what let the first question after a restart block until the Node proxy
aborted it.

Importing `main` is safe in tests because the boot warm-up now runs in the ASGI
lifespan hook, and starlette's TestClient only runs lifespan inside a `with`
block. So the routes are exercised for real, with zero model loading.
"""
import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.core import warmup as warmup_mod
from app.core.warmup import FAILED, PENDING, READY, SKIPPED, WarmupRegistry

import main as ai_main


# ── the registry itself ──────────────────────────────────────────────


def test_starts_pending_and_not_ready():
    reg = WarmupRegistry()
    reg.register("rag")
    assert reg.is_ready() is False
    assert reg.state() == "warming"
    assert reg.warming() == ["rag"]


def test_required_component_reaching_ready_flips_the_registry():
    reg = WarmupRegistry()
    reg.register("rag")
    reg.mark("rag", READY)
    assert reg.is_ready() is True
    assert reg.state() == READY
    assert reg.warming() == []


def test_required_component_failure_is_degraded_not_ready():
    reg = WarmupRegistry()
    reg.register("rag")
    reg.mark("rag", FAILED, detail="RuntimeError: no such file")
    assert reg.is_ready() is False
    assert reg.state() == "degraded"
    assert reg.failures() == ["rag"]


def test_empty_registry_is_not_ready():
    """`all()` over no components is vacuously True. Without this guard a
    registry nothing has registered into yet would report ready and let the
    first request through before a single model had loaded."""
    reg = WarmupRegistry()
    assert reg.is_ready() is False
    assert reg.state() == "warming"
    assert reg.snapshot()["ready"] is False


def test_only_optional_components_is_still_not_ready():
    """Optional components must never, on their own, constitute readiness."""
    reg = WarmupRegistry()
    reg.register("stt", required=False)
    reg.mark("stt", READY)
    assert reg.is_ready() is False


def test_optional_failure_warns_but_never_blocks_readiness():
    """Whisper/IndicTrans2 are fallbacks. A box that cannot load them must
    still serve text chat, so they must not gate /health/ready."""
    reg = WarmupRegistry()
    reg.register("rag")
    reg.register("stt", required=False)
    reg.mark("stt", FAILED, detail="RuntimeError: no whisper")
    reg.mark("rag", READY)
    assert reg.is_ready() is True
    assert reg.state() == READY
    snap = reg.snapshot()
    assert snap["failed"] == ["stt"]
    assert snap["warnings"] == ["stt: RuntimeError: no whisper"]


def test_skipped_counts_as_settled_and_not_a_warning():
    """Cloud MT active means IndicTrans2 is deliberately left unloaded (~1 GB
    of RAM we want back). That is a decision, not a fault."""
    reg = WarmupRegistry()
    reg.register("translation", required=False)
    reg.mark("translation", SKIPPED, detail="cloud MT engine active")
    assert reg.warming() == []
    assert reg.failures() == []
    assert reg.snapshot()["warnings"] == []


def test_snapshot_never_deadlocks_on_its_own_lock():
    """snapshot() calls state(), which locks. A plain Lock would self-deadlock;
    TestClient would hang rather than fail, so the timeout is the assertion."""
    reg = WarmupRegistry()
    reg.register("rag")
    reg.register("stt", required=False)
    done = threading.Event()

    def _go():
        reg.snapshot()
        reg.snapshot()
        done.set()

    threading.Thread(target=_go, daemon=True).start()
    assert done.wait(timeout=5) is True


def test_first_settlement_wins():
    """A component that failed at boot retries lazily on first use. That
    success must not be allowed to rewrite history — the failure is what the
    operator needs to see in the logs and in /health."""
    reg = WarmupRegistry()
    reg.register("rag")
    reg.mark("rag", FAILED, detail="boot failure")
    reg.mark("rag", READY)
    assert reg.snapshot()["components"]["rag"]["state"] == FAILED
    assert reg.is_ready() is False


def test_mark_rejects_non_settled_state():
    reg = WarmupRegistry()
    with pytest.raises(ValueError):
        reg.mark("rag", PENDING)


def test_track_records_success_and_the_thread_joins():
    reg = WarmupRegistry()
    reg.track("rag", lambda: time.sleep(0.01), required=True)
    for _ in range(200):  # the thread is short; join it deterministically
        if reg.is_ready():
            break
        time.sleep(0.01)
    assert reg.is_ready() is True
    assert reg.snapshot()["components"]["rag"]["state"] == READY


def test_track_records_failure_with_a_short_reason():
    reg = WarmupRegistry()
    thread = reg.track("rag", lambda: 1 / 0, required=True)
    thread.join(timeout=5)
    component = reg.snapshot()["components"]["rag"]
    assert component["state"] == FAILED
    assert "ZeroDivisionError" in component["detail"]
    assert reg.is_ready() is False


def test_track_skip_if_marks_skipped_without_running_the_loader():
    reg = WarmupRegistry()
    ran = []
    reg.track("translation", lambda: ran.append(1), required=False, skip_if=lambda: True)
    time.sleep(0.1)
    assert ran == []
    assert reg.snapshot()["components"]["translation"]["state"] == SKIPPED


def test_register_is_idempotent():
    """main registers the same names every boot; a second register must not
    reset an already-loaded component back to pending."""
    reg = WarmupRegistry()
    reg.register("rag")
    reg.mark("rag", READY)
    reg.register("rag")
    assert reg.is_ready() is True


def test_wait_until_ready_returns_false_on_timeout_then_true_when_settled():
    reg = WarmupRegistry()
    reg.register("rag")
    assert reg.wait_until_ready(timeout=0.05) is False

    reg.register("rag")
    threading.Timer(0.05, lambda: reg.mark("rag", READY)).start()
    assert reg.wait_until_ready(timeout=5) is True


def test_wait_until_ready_returns_immediately_when_already_ready():
    reg = WarmupRegistry()
    reg.register("rag")
    reg.mark("rag", READY)
    started = time.monotonic()
    assert reg.wait_until_ready(timeout=30) is True
    assert time.monotonic() - started < 1  # did not actually block


# ── the HTTP surface ─────────────────────────────────────────────────


@pytest.fixture
def client():
    return TestClient(ai_main.app)


@pytest.fixture
def registry(monkeypatch):
    """Point the app at a fresh registry per test and leave it clean after.

    Also clears AI_INTERNAL_KEY: a developer's local ai-service/.env usually
    sets it, and the middleware would then (correctly) 401 every /ask in these
    tests. test_health_paths_bypass_the_internal_key sets it back on purpose.
    """
    fresh = WarmupRegistry()
    monkeypatch.setattr(warmup_mod, "REGISTRY", fresh)
    monkeypatch.setattr(ai_main.warmup, "REGISTRY", fresh)
    monkeypatch.setattr(ai_main.settings, "AI_INTERNAL_KEY", "")
    return fresh


def test_health_is_open_and_reports_warming_not_ok_pretend(client, registry):
    registry.register("rag")
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"          # liveness contract kept for verify.mjs
    assert body["ready"] is False          # the honest part
    assert body["warmup"]["state"] == "warming"
    assert body["warmup"]["warming"] == ["rag"]
    assert "components" in body["warmup"]


def test_health_reports_ready_once_the_required_component_is_up(client, registry):
    registry.register("rag")
    registry.mark("rag", READY)
    body = client.get("/health").json()
    assert body["ready"] is True
    assert body["warmup"]["state"] == READY
    assert body["warmup"]["uptime_s"] >= 0


def test_ready_is_503_before_anything_registers(client, registry):
    """The window between the process starting and lifespan registering the
    components must not be a green light."""
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.json()["ready"] is False


def test_live_is_always_200_even_while_warming(client, registry):
    """A warming service must NOT be restarted: that restarts the very load it
    is waiting on. Liveness must never reflect warm-up progress."""
    registry.register("rag")
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/live").json()["status"] == "alive"


def test_ready_is_503_while_warming_and_200_once_ready(client, registry):
    registry.register("rag")
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.json()["ready"] is False
    assert r.headers["Retry-After"] == "5"
    assert "in progress" in r.json()["detail"]

    registry.mark("rag", READY)
    r = client.get("/health/ready")
    assert r.status_code == 200
    assert r.json()["ready"] is True
    assert r.json()["status"] == "ready"


def test_ready_is_503_and_explains_itself_when_rag_failed(client, registry):
    registry.register("rag")
    registry.mark("rag", FAILED, detail="ValueError: no index")
    r = client.get("/health/ready")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "degraded"
    assert "retry on demand" in body["detail"]
    assert body["warmup"]["failed"] == ["rag"]


def test_ask_waits_then_serves_once_warmup_finishes(client, registry, monkeypatch):
    """The good case must be preserved: a question during warm-up still gets a
    real answer, it is just not a coin flip against the proxy timeout."""
    registry.register("rag")
    answered = {}

    def fake_answer(question, language):
        answered["q"] = (question, language)
        return {"answer": "ok", "grounded": True}

    monkeypatch.setattr(ai_main.rag_service, "answer_question", fake_answer)
    threading.Timer(0.05, lambda: registry.mark("rag", READY)).start()

    r = client.post("/ask", json={"question": "What is MGNREGA?", "language": "en"})
    assert r.status_code == 200
    assert r.json()["answer"] == "ok"
    assert answered["q"] == ("What is MGNREGA?", "en")


def test_ask_gives_up_with_503_rather_than_hanging(client, registry, monkeypatch):
    """Past WARMUP_WAIT_SECONDS we return fast and honest, so the Node proxy
    shows the localised 'still starting' message instead of aborting at 120s."""
    monkeypatch.setattr(ai_main.settings, "WARMUP_WAIT_SECONDS", 0.05)
    registry.register("rag")
    called = []
    monkeypatch.setattr(
        ai_main.rag_service, "answer_question", lambda q, l: called.append(q)
    )

    r = client.post("/ask", json={"question": "What is MGNREGA?", "language": "en"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "5"
    body = r.json()
    assert body["ready"] is False
    assert body["warming"] == ["rag"]
    assert "starting up" in body["detail"]
    assert called == []  # the half-loaded pipeline was never consulted


def test_ask_validates_before_consulting_warmup(client, registry, monkeypatch):
    """A malformed request is a 400 even during warm-up; validation must not
    change shape just because the service is busy."""
    registry.register("rag")
    assert client.post("/ask", json={"question": "  "}).status_code == 400
    assert client.post("/ask", json={"question": "x" * 2001}).status_code == 400


def test_health_paths_bypass_the_internal_key(client, registry, monkeypatch):
    """Probes cannot present the Node server's key, so the health paths must be
    exempt from auth — including /ready, which is the one a probe actually uses."""
    monkeypatch.setattr(ai_main.settings, "AI_INTERNAL_KEY", "s3cret")
    registry.register("rag")
    assert client.get("/health").status_code == 200
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").status_code == 503  # unauthenticated probe
    # ...and everything else is still locked down.
    assert client.post("/ask", json={"question": "hi"}).status_code == 401
