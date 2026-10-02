"""ShramSetu AI microservice (FastAPI, port 8100).

Internal API consumed only by the Node.js backend:
  POST /ask        {question, language}         → ChatAnswer JSON (RAG + Groq)
  GET  /speak      ?text=&language=             → audio/wav (Sarvam → Google TTS)
  POST /transcribe ?language= (multipart: file) → {text} (local faster-whisper)

Access control:
  - Every route except GET /health requires X-Internal-Key when
    AI_INTERNAL_KEY is set (the Node server sends it from its own env).
  - Per-IP rate limiting and request-size caps guard against abuse.
  - Text sent to EXTERNAL providers (Groq, Sarvam, Google) is scrubbed for
    mobile/Aadhaar numbers first (app/services/pii.py).
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from app.core.config import settings
from app.services import rag_service, stt_service, tts_service
from app.services.pii import strip_pii

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("shramsetu.ai")

# This box has 4 cores; torch sometimes defaults to fewer intra-op threads
# here. Use all of them for Coqui TTS / Whisper / IndicTrans2 — must run
# BEFORE any model loads (incl. the TTS preload thread below).
try:
    import os as _os

    import torch as _torch

    _torch.set_num_threads(max(1, _os.cpu_count() or 1))
    logger.info("torch intra-op threads = %d", _torch.get_num_threads())
except Exception:  # pragma: no cover - torch missing / already initialized
    pass

app = FastAPI(title="ShramSetu AI Service", version="1.0.0")

LANGS = {"en", "hi", "bn", "te", "ta", "ml"}

# ── Service-to-service auth + abuse guards ──────────────────────────
_MAX_BODY_MB = 25  # covers the largest /transcribe upload (MAX_AUDIO_MB=15)


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


_hits: dict[str, deque] = defaultdict(lambda: deque(maxlen=256))


@app.middleware("http")
async def guard_middleware(request: Request, call_next):
    path = request.url.path

    # Health is intentionally open (container probes, verify scripts).
    if path != "/health":
        if settings.AI_INTERNAL_KEY and request.headers.get("X-Internal-Key") != settings.AI_INTERNAL_KEY:
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        # Per-IP rate limit.
        ip = _client_ip(request)
        now = time.monotonic()
        window = _hits[ip]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= settings.AI_RATE_LIMIT_PER_MIN:
            return JSONResponse({"detail": "Rate limit exceeded, slow down."}, status_code=429)
        window.append(now)

        # Request-size cap (headers only; body streams are validated per-route).
        try:
            length = int(request.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length > _MAX_BODY_MB * 1024 * 1024:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)

    return await call_next(request)

# Prewarm the RAG pipeline FIRST. Embeddings + FAISS are the heavy local part
# of every /ask; warming them ahead of the STT/translation models is what keeps
# the first question after a restart inside the Node proxy's abort window.
rag_service.prewarm()

# TTS is cloud-only now (Sarvam -> Google): nothing to preload at boot.

# Same idea for IndicTrans2: load + int8-quantize at boot in a background
# thread so the first Indic /ask skips a cold model load that used to stall
# the endpoint for minutes on a RAM-constrained box.
from app.services import translation_service  # noqa: E402

translation_service.prewarm()

# Prewarm local faster-whisper too: it is the STT fallback when Groq/Sarvam
# are unreachable, and a cold load mid-demo would add ~8s on top of the
# ~6s CPU transcription.
from app.services import stt_service  # noqa: E402

stt_service.prewarm()


def _run_blocking(fn, *args):
    """Run a CPU-bound model call (whisper/coqui/indictrans2) on the
    threadpool so the event loop stays responsive during inference."""
    return asyncio.get_running_loop().run_in_executor(None, lambda: fn(*args))


@app.get("/health")
def health():
    return {"status": "ok", "service": "shramsetu-ai"}


@app.post("/ask")
def ask(payload: dict):
    question = str(payload.get("question") or "").strip()
    language = payload.get("language") or "en"
    if language not in LANGS:
        language = "en"
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    if len(question) > 2000:
        raise HTTPException(status_code=400, detail="question too long")

    # Scrub PII BEFORE the question reaches retrieval, the Groq LLM or any
    # translation provider (the whole pipeline is downstream of this call).
    question = strip_pii(question)

    # Blocking on purpose: embeddings + FAISS + translation + LLM.
    # FastAPI runs sync endpoints on the threadpool — exactly right for this.
    return rag_service.answer_question(question, language)


@app.get("/speak")
async def speak(
    text: str = Query(""),
    language: str = Query("en"),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long to speak")
    text = strip_pii(text)
    language = language.split("-")[0].lower()
    try:
        audio, media_type = await _run_blocking(tts_service.synthesize_speech, text, language)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return Response(content=audio, media_type=media_type)


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Query(None)):
    content = await file.read()
    filename = file.filename or "audio.webm"
    logger.info("[transcribe] file=%s size=%d lang=%s", filename, len(content), language)

    if not content or len(content) < 500:
        raise HTTPException(status_code=400, detail="Audio too short — record for at least 1 second.")
    if len(content) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large")

    try:
        text = await _run_blocking(stt_service.transcribe_audio, content, filename, language)
        logger.info("[transcribe] result=%r", text[:80] if text else "(empty)")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"text": text.strip()}
