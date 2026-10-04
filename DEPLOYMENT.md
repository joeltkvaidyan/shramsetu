# ShramSetu — Production Deployment Guide

Ship the four-service stack with `docker compose`, which assembles Mongo, the AI
service, the Node API server and the nginx frontend into one Docker Compose file.
Run `docker compose up -d` from the repo root, then wait for readiness before
pointing the browser at the public origin.

```bash
# 1. Fill the ROOT .env — docker compose interpolates every bare env name
#    below from it (it is gitignored; copy keys from .env.example):
#      JWT_SECRET_KEY, GROQ_API_KEY, GROQ_MODEL, SARVAM_API_KEY, HF_TOKEN,
#      AI_INTERNAL_KEY, BOOTSTRAP_ADMIN_PASSWORD, DOC_MASTER_KEY
#    GEMINI_API_KEY / GOOGLE_API_KEY are optional fallbacks.
#    Per-service .env files (server/.env, ai-service/.env) are NOT read by
#    the containers — the compose `environment:` block is the only source.

# 2. Build & start the stack detached.
docker compose up -d

# 3. Confirm every service is healthy before serving traffic.
docker compose ps          # every service "healthy" (not "starting" or "unhealthy")
curl -s http://localhost:8100/health/ready      # ai-service: true when warm
curl -s http://localhost:8000/health            # server: 200 {status:"ok"}
wget -qO- http://localhost/                     # frontend: index.html (SPA)

# 4. Load a demo worker, verify the proxy chain is live.
#    From a browser log in as a worker and hit /api/v1/chat or
#    /api/v1/grievances. The chain is: nginx frontend :80 -> server :8000
#    -> ai-service :8100, exercised on every request.
```

## Services

| Service | Container | Port | Healthcheck |
|---|---|---|---|
| mongo | `mongo:8` | 27017 | `mongosh` ping |
| ai-service | `shramsetu-ai-service` (built from `ai-service/Dockerfile`) | 8100 | `/health/ready` (503 while warming) |
| server | `shramsetu-server` (built from `server/Dockerfile`) | 8000 | `node scripts/healthcheck.js` |
| frontend | `shramsetu-frontend` (built from `frontend/Dockerfile`) | 80/443 | `wget` spider on `/` |

## The four live providers the platform routes traffic through

- **LLM:** Groq (primary) → Google Gemini (fallback) → deterministic local JSON
  fallback. `ai-service/app/services/rag_service.py::_get_llm()` resolves this
  chain; the AI service only accepts an internal key from the Node server, so
  the sandbox never calls a provider directly.
- **STT:** local `faster-whisper` (CPU, no key, no cloud call). Language is
  auto-detected, then re-decoded with the Indic model for non-English.
- **TTS:** Sarvam Bulbul (primary) → Google Cloud TTS (fallback).
  `ai-service/app/services/tts_service.py::synthesize_speech()` returns
  `audio/wav`.
- **Query translation:** English-first retrieval (IndicTrans2 → NLLB fallback).

## Volumes

- `mongo_data` — persistent MongoDB data.
- `ai_index` — FAISS index; mounted at runtime so rebuilds don't rebuild the
  index.
- `ai_models` — Hugging Face model weights (whisper, IndicTrans2, embeddings),
  pinned via `HF_HOME=/app/models/huggingface` so restarts don't re-download.
- `frontend_uploads` — mounted but unused by nginx; server uploads live on the
  server container's writable layer (add a volume there if uploads must survive
  recreation).

## Pull the stack onto another host

```bash
docker compose pull && docker compose up -d
```

Named volumes are preserved, so the FAISS index and model weights survive
rebuilds.

## Scope & hard requirements

- `ENV=production` makes the server refuse to boot unless `JWT_SECRET_KEY`,
  `BOOTSTRAP_ADMIN_PASSWORD` (non-default), `OTP_ECHO_ENABLED=false`,
  `SEED_DEMO_DATA=false`, `DOC_MASTER_KEY` and `MONGODB_URI` (not the
  in-memory instance) are set.
- Requires a Groq API key for grounded LLM answers; retrieval and honest
  refusals still work without one.
- Real HTTPS/TLS termination and a real SMS gateway for OTP delivery are still
  needed for a production-grade rollout; this stack is production-*oriented*.
  Note: OTPs are only printed to the server log (`sendOtp` in
  `server/src/routes/auth.js`) — there is no SMS/email channel yet, so mobile
  login codes are operator-visible, not user-deliverable.
