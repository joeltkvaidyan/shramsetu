# ShramSetu — Production Deployment Guide

Ship the four-service stack with `docker compose`, which assembles Mongo, the AI
service, the Node API server and the nginx frontend into one Docker Compose file.
Run `docker compose up -d` from the repo root, then wait for readiness before
pointing the browser at the public origin.

```bash
# 1. Fill the ROOT .env — docker compose interpolates every bare env name
#    below from it (it is gitignored; copy keys from .env.example):
#      JWT_SECRET_KEY, GROQ_API_KEY, GROQ_MODEL, HF_TOKEN,
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
- **TTS:** local Meta MMS VITS, in-process (no key, no cloud call).
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

## Deploy on Render (render.yaml blueprint)

`render.yaml` at the repo root describes the same four services as a Render
Blueprint, mapped one service per Render resource (Render does not run
`docker compose` directly):

| Resource | Type | Plan | URL |
|---|---|---|---|
| `shramsetu-web` | static site (Vite build) | free | https://shramsetu-web.onrender.com |
| `shramsetu-api` | web service (Docker) | 0.5c-512mb | https://shramsetu-api.onrender.com |
| `shramsetu-ai` | web service (Docker) + 5GB disk | 2c-4g | https://shramsetu-ai.onrender.com |
| `shramsetu-db` | private service (`mongo:8`) + 1GB disk | 0.5c-512mb | private network only |

- **Secrets** are `sync: false` in the blueprint (`JWT_SECRET_KEY`,
  `BOOTSTRAP_ADMIN_PASSWORD`, `DOC_MASTER_KEY`, `AI_INTERNAL_KEY`,
  `GROQ_API_KEY`, `HF_TOKEN`). The Render dashboard prompts
  for them during blueprint creation; blueprints created through the API
  leave them empty until set — set them before first boot, and keep
  `AI_INTERNAL_KEY` **identical** on `shramsetu-api` and `shramsetu-ai`.
- **Cross-origin SPA:** static sites have no nginx proxy, so the SPA builds
  with `VITE_API_BASE_URL=https://shramsetu-api.onrender.com/api/v1` and the
  API allows the web origin via `CORS_ORIGINS`. Under docker-compose the
  variable is unset and the nginx same-origin proxy takes over unchanged.
- **Mongo** is private-only; the blueprint passes `MONGO_HOST` (a
  `fromService` `host` reference — render.yaml cannot interpolate a full
  URI) and `server/src/config.js` assembles the connection string from
  `MONGO_USER`/`MONGO_PASSWORD`/`MONGO_DB`.
- **Model footprint:** the Render plan runs `WHISPER_MODEL_SIZE=small` with
  `WHISPER_INDIC_MODEL` empty (one resident whisper model, ~2.5GB peak) to
  fit 4GB. Raise the plan to `2c-8g` and restore compose's
  `large-v3-turbo` + indic model for accuracy.
- **Health gates:** `shramsetu-ai` gates on `/health` (not `/health/ready`)
  because model downloads finish minutes after boot in background threads.
- **OTP demo mode:** worker login codes are printed to the `shramsetu-api`
  logs (readable in the Render dashboard). Admin login uses
  `BOOTSTRAP_ADMIN_PASSWORD` (employee id `ADMIN001`).
