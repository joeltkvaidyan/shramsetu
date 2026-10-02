# ShramSetu — Architecture (current)

Companion to [README.md](../README.md) and [WORKFLOW.md](../WORKFLOW.md)
(deep walkthrough). This file is the quick, factual map of what runs where.

## Services

| Service | Stack | Port | Entry |
|---|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind (PWA) | 5199 (dev) | `frontend/` |
| API server | Node.js 22 + Express 4 + Mongoose 8 | 8000 | `server/src/index.js` → `app.js` |
| AI service | Python 3.10 + FastAPI | 8100 | `ai-service/main.py` (uvicorn) |
| MongoDB | 8.0 (embedded dev instance or real) | 27017 | `MONGODB_URI` in `server/.env` |

`start-all.ps1` / `stop-all.ps1` manage the three app services on Windows;
each can also be started manually (see README). The frontend talks only to
the Node server (`/api` proxy); only the Node server talks to the AI
service, and every such request must carry `X-Internal-Key`.

## Request flow

```
Browser ──JWT──► Express (auth → rate limit → route)
                   │                     │
                   │                     └──► MongoDB (Mongoose models)
                   └──X-Internal-Key──► FastAPI (PII strip → translate →
                                          FAISS → gate → Groq) ──► Groq/Sarvam/Google
```

## Key directories

| Path | Contents |
|---|---|
| `server/src/routes/` | auth, grievances, documents, government, notifications, workers, chat (AI proxy), wages, sos |
| `server/src/middleware/` | `auth.js` (JWT + liveness cache), `rateLimit.js` |
| `server/src/utils/` | `scope.js` (jurisdiction), `docKeys.js` (key wrapping), `fileValidation.js`, `audit.js` |
| `server/src/seed/` | create-only bootstrap admin + demo officials/workers (`SEED_DEMO_DATA`) |
| `server/tests/` | vitest: 50 tests — 40 security/scope + 10 wage/SOS parity (mongodb-memory-server) |
| `ai-service/app/services/` | rag_service, translation_service, stt_service (faster-whisper), tts_service (Sarvam/Google), pii |
| `ai-service/rag/` | `sample_docs/` (curated corpus with provenance headers), `loader.py`, `ingest.py`, FAISS index (generated, gitignored) |
| `ai-service/tests/` | pytest: corpus integrity, loader, RAG contract, PII, prompt injection |
| `ai-service/eval/` | 50-question multilingual eval suite + `run_eval.py` → `RESULTS.md` |
| `frontend/src/` | pages, `context/AuthContext`, `api/client.ts`, `i18n/locales/` (6 languages) |
| `docs/archive/` | documents describing the earlier FastAPI/SQLite version (banned with a banner) |

## Configuration surfaces

| File | Key variables |
|---|---|
| `server/.env` | `MONGODB_URI`, `JWT_SECRET_KEY`, `DOC_MASTER_KEY`, `AI_INTERNAL_KEY`, `CORS_ORIGINS`, `OTP_ECHO_ENABLED`, `SEED_DEMO_DATA`, `BOOTSTRAP_ADMIN_PASSWORD`, rate-limit knobs |
| `ai-service/.env` | `AI_INTERNAL_KEY`, `GROQ_API_KEY`/`GROQ_MODEL`, `SARVAM_API_KEY`, `GOOGLE_API_KEY`, `TTS_PROVIDER`, `RAG_MIN_SIMILARITY`, `RAG_TOP_K`, `AI_RATE_LIMIT_PER_MIN` |
| `frontend/.env` | none required in dev (Vite proxy) |

`.env.example` files document each variable; real `.env` files are
gitignored. Production boot of the server fails without the safe
configuration described in [SECURITY.md](SECURITY.md).
