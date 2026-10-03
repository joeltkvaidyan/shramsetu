"""Boot warm-up registry: is the service LISTENING, or can it actually ANSWER?

THE PROBLEM THIS FIXES
----------------------
Every heavy model in this service is loaded in a background thread at boot
(embeddings + FAISS, IndicTrans2, faster-whisper). Uvicorn binds :8100 and
starts serving the instant those threads are *spawned* -- not when they finish.
The old /health returned a constant `{"status": "ok"}`, so it went green within
a second of launch while the RAG pipeline was still loading for a minute or more
on a 4-core box.

That made cold start unreliable in the one way that hurts at a demo: the health
check went green, the operator opened the frontend and asked the first question,
and the request blocked behind a half-loaded embedding model until the Node
proxy aborted it at 120s -- surfacing to the worker as "ai-service unavailable:
This operation was aborted". The health check did not lie by accident; it simply
had no way of knowing.

THE MODEL
---------
Each heavy subsystem registers a *component* here and settles into exactly one
terminal state:

    pending  -> still loading. A port is open; answers will be slow.
    ready    -> loaded and usable.
    failed   -> raised during load. It retries lazily on first use, so a failed
                component is usually recoverable -- but it must not be reported
                as ready.
    skipped  -> deliberately not loaded (e.g. a cloud MT engine is configured,
                so the ~1 GB IndicTrans2 model is intentionally left unloaded to
                keep RAM headroom for STT). Counts as settled, not as a fault.

`required` decides what blocks readiness. RAG is required: without it /ask
cannot answer at all. Translation and STT are optional: they are fallbacks for
when a cloud provider is unreachable, and a box with no whisper model must still
be able to serve text chat. Optional failures are surfaced as warnings instead
of making the service un-ready.

READINESS IS NOT THE SAME AS LIVENESS
-------------------------------------
A process that is up but whose RAG index failed to load should NOT be restarted
in a loop -- it should be reported as alive-but-not-ready. So:
  * /health/live  -> 200 whenever the process is up. Never fails.
  * /health/ready -> 200 only when every REQUIRED component is `ready`.
Anything monitoring this service should probe /health/ready, and a deploy script
that wants to wait for real answers should wait on it too.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional

PENDING = "pending"
READY = "ready"
FAILED = "failed"
SKIPPED = "skipped"

#: States that mean "this component will not change again on its own".
SETTLED = (READY, FAILED, SKIPPED)


class Component:
    """One tracked subsystem. Mutated only under the registry lock."""

    __slots__ = ("name", "required", "state", "detail", "seconds")

    def __init__(self, name: str, required: bool = True) -> None:
        self.name = name
        self.required = required
        self.state = PENDING
        self.detail: Optional[str] = None
        self.seconds: Optional[float] = None  # how long the load actually took

    @property
    def settled(self) -> bool:
        return self.state in SETTLED

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "required": self.required,
            "seconds": round(self.seconds, 2) if self.seconds is not None else None,
            "detail": self.detail,
        }


class WarmupRegistry:
    """Thread-safe registry of warm-up components. One per process."""

    def __init__(self) -> None:
        # RLock, not Lock: snapshot() calls state(), which locks again.
        self._lock = threading.RLock()
        self._components: dict[str, Component] = {}
        self._ready_event = threading.Event()
        self._started_at = time.monotonic()

    # -- registration ----------------------------------------------------

    def register(self, name: str, required: bool = True) -> None:
        """Declare a component up front so /health can name it while pending.

        Registering twice is a no-op: this is called at import/startup and must
        not reset a component that already finished loading.
        """
        with self._lock:
            if name not in self._components:
                self._components[name] = Component(name, required=required)

    def mark(self, name: str, state: str, detail: Optional[str] = None) -> None:
        """Settle a component and, if the registry became ready, wake waiters."""
        with self._lock:
            component = self._components.setdefault(name, Component(name))
            if state not in SETTLED:
                raise ValueError(f"{state!r} is not a settled state")
            if component.settled:
                return  # first settlement wins; a later retry must not un-ready it
            component.state = state
            component.detail = detail
            if component.state == READY:
                component.seconds = time.monotonic() - self._started_at
            ready = self._is_ready_locked()
        if ready:
            self._ready_event.set()

    def track(
        self,
        name: str,
        fn: Callable[[], Any],
        *,
        required: bool = True,
        skip_if: Optional[Callable[[], bool]] = None,
    ) -> threading.Thread:
        """Run `fn()` on a daemon thread and record how it went.

        The previous pattern in this codebase was three copies of
        `threading.Thread(target=_load, name=..., daemon=True).start()` with a
        try/except that only logged. That gave no way to ask what was still
        loading. This keeps the same fire-and-forget behaviour but records it.

        `skip_if` is checked *inside* the thread so the check can touch lazily
        initialised state; a True result settles the component as `skipped`
        rather than reporting a fault for a load we never wanted.
        """
        self.register(name, required=required)

        def _run() -> None:
            try:
                if skip_if is not None and skip_if():
                    self.mark(name, SKIPPED, detail="not needed in this configuration")
                    return
                fn()
            except Exception as exc:  # noqa: BLE001 - recorded, not swallowed
                # Keep the message short: this string is served by /health.
                self.mark(name, FAILED, detail=f"{type(exc).__name__}: {exc}"[:300])
            else:
                self.mark(name, READY)

        thread = threading.Thread(target=_run, name=f"warmup-{name}", daemon=True)
        thread.start()
        return thread

    # -- queries ---------------------------------------------------------

    def _is_ready_locked(self) -> bool:
        required = [c for c in self._components.values() if c.required]
        # The empty case matters: `all()` over nothing is vacuously True, so a
        # registry nothing has registered into yet would report "ready" and let
        # traffic through before a single model had loaded. Require at least one
        # required component to have actually settled.
        return bool(required) and all(c.state == READY for c in required)

    def is_ready(self) -> bool:
        with self._lock:
            return self._is_ready_locked()

    def warming(self) -> list[str]:
        """Required components still loading. Empty list once ready."""
        with self._lock:
            return sorted(
                c.name for c in self._components.values()
                if c.required and not c.settled
            )

    def failures(self) -> list[str]:
        with self._lock:
            return sorted(c.name for c in self._components.values() if c.state == FAILED)

    def state(self) -> str:
        """One word for a human: warming | ready | degraded."""
        with self._lock:
            if self._is_ready_locked():
                return READY
            if any(c.state == FAILED for c in self._components.values() if c.required):
                return "degraded"
            return "warming"

    def wait_until_ready(self, timeout: float) -> bool:
        """Block until ready or `timeout` elapses. Returns whether it is ready.

        Used by /ask so a request that arrives during boot waits a *bounded*
        time instead of either answering instantly from a half-loaded model or
        hanging until the Node proxy aborts it.
        """
        if self.is_ready():
            return True
        return self._ready_event.wait(timeout)

    def snapshot(self) -> dict[str, Any]:
        """JSON-safe view for /health. Deliberately free of file paths and keys."""
        with self._lock:
            components = {n: c.as_dict() for n, c in sorted(self._components.items())}
            warnings = [
                f"{c.name}: {c.detail or 'failed'}"
                for c in sorted(self._components.values(), key=lambda c: c.name)
                if c.state == FAILED and not c.required
            ]
            return {
                "ready": self._is_ready_locked(),
                "state": self.state(),
                "warming": sorted(
                    c.name for c in self._components.values()
                    if c.required and not c.settled
                ),
                "failed": sorted(
                    c.name for c in self._components.values() if c.state == FAILED
                ),
                "warnings": warnings,
                "components": components,
                "uptime_s": round(time.monotonic() - self._started_at, 1),
            }


#: Process-wide registry. `main` fills it during startup; tests build their own.
REGISTRY = WarmupRegistry()
