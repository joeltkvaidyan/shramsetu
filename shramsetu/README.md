# ShramSetu — Phase 1 + 2

**AI-First Multilingual Digital Welfare Platform for Migrant Workers**

Phase 1 delivered a production-ready, mobile-first Progressive Web App with a fully working **Worker** module. Phase 2 adds a grievance/complaint system (now forwarded by email to the Labour Department and, for harassment/abuse cases, Police), OTP-verified registration with a full migrant-worker profile, working voice input/output, paginated storage, and a native **React Native/Expo mobile app** alongside the web PWA. Employer, Government, and Insurance roles remain a "Coming Soon" screen, as scoped.

**See `IMPLEMENTATION_GUIDE.md`** for what's automatically verified vs. what needs your own API keys/mailbox to confirm live, plus a step-by-step checklist to get every feature working end-to-end.

There are now **two frontends** sharing one backend: `frontend/` (web PWA) and `mobile/` (Expo app for Android/iOS) — see `mobile/README.md` for mobile-specific setup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + SQLModel + PostgreSQL (SQLite for local dev) |
| AI / RAG | LangChain + FAISS + Sentence-Transformers (embeddings) + **Groq API** (generation) |
| Auth | JWT (python-jose + passlib/bcrypt) |
| File storage | Local disk (Phase 1), abstracted for a future cloud swap |
| Infra | Docker, Docker Compose, GitHub Actions |

> **Why Groq instead of Ollama:** the product spec listed Ollama, but this build uses the **Groq API** per the latest instructions — it's free-tier, hosted, and much easier to run in a sandboxed/dev environment than a local Ollama daemon, while retrieval (FAISS + Sentence-Transformers) stays 100% local and free either way. Swapping back to Ollama later only touches `app/services/rag_service.py`.

---

## Project Structure

```
shramsetu/
├── backend/
│   ├── app/
│   │   ├── core/            # config, security (JWT/hashing)
│   │   ├── db/               # SQLModel engine/session
│   │   ├── models/           # User, Document, ChatMessage
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── repositories/     # Data access layer (Repository Pattern)
│   │   ├── services/         # Business logic (Auth, OTP, Document, Storage, RAG, STT, Notifications)
│   │   └── api/v1/           # FastAPI routers
│   ├── rag/
│   │   ├── sample_docs/      # Seed government welfare documents (.txt)
│   │   ├── loader.py         # Parses documents + chunks text
│   │   └── ingest.py         # Builds the FAISS index
│   ├── alembic/               # DB migrations (for Postgres/production)
│   ├── tests/                 # pytest suite
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/             # Language select, roles, worker auth, dashboard, wallet, chat, grievances, settings
│   │   ├── components/        # Screen shell, BottomNav, ProtectedRoute, GrievanceStatusBadge
│   │   ├── i18n/               # Language registry + 6 seeded locale files
│   │   ├── hooks/useVoice.ts  # Web Speech API wrapper (STT + TTS)
│   │   ├── store/              # Auth + Theme React contexts
│   │   └── api/client.ts       # Axios instance with JWT injection
│   ├── Dockerfile              # Multi-stage build served by nginx
│   └── nginx.conf
├── docker-compose.yml
└── .github/workflows/ci.yml
```

**Architecture principles used throughout:** Clean Architecture layering (routes → services → repositories → models), Repository Pattern for all DB access, a Service Layer holding business logic, and Dependency Injection via FastAPI's `Depends`. The `StorageService` abstract class means swapping local disk for S3/GCS later requires zero changes to routes or repositories.

---

## Quick Start (Docker — recommended)

`docker compose up` runs the stack in production mode (Postgres, Alembic migrations applied automatically, multi-worker backend) — see [Production Deployment](#production-deployment) below for what that means. It refuses to start with a placeholder JWT secret, so generate a real one first:

```bash
cp .env.example .env
# generate a real secret and put it in .env as JWT_SECRET_KEY=<output>
openssl rand -hex 32
# edit .env and also set GROQ_API_KEY (free key: https://console.groq.com)

docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API + docs: http://localhost:8000/docs
- Postgres: localhost:5432 (user: `shramsetu`, db: `shramsetu`, password: whatever you set as `POSTGRES_PASSWORD`, defaults to `shramsetu`)

The FAISS index is pre-built at container startup (see [Production Deployment](#production-deployment)) rather than on first request.

---

## Production Deployment

What changed to make this production-ready, beyond "it runs":

**Database.** Postgres via `docker-compose.yml`, with a real connection pool (`pool_pre_ping`, configurable `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`, connection recycling) instead of a bare connection. Schema changes go through **real Alembic migrations** (`backend/alembic/versions/`) — the initial migration reflecting every current table/index is included and verified to apply and roll back cleanly. `docker-compose.yml` sets `RUN_MIGRATIONS_ON_START=true`, so `alembic upgrade head` runs automatically as the container starts (see `backend/entrypoint.sh`); the dev-convenience "create tables if missing" fallback (`init_db()`) still runs too, but is idempotent and only matters for zero-config local SQLite use.

**File storage.** `STORAGE_BACKEND=local` (default) is fine for a single-instance deployment with a persistent volume (which `docker-compose.yml` provides). For anything running on multiple instances, or wanting durable object storage independent of the app container, set `STORAGE_BACKEND=s3` — works with real AWS S3 or a free-tier S3-compatible service (Cloudflare R2: 10GB free; Backblaze B2 also has a free tier). Downloads are then served via short-lived signed URLs (5 min by default) instead of streaming file bytes through the API process.

**Chatbot (RAG) readiness.** The embedding model and FAISS index now load **at app startup**, not on the first user's chatbot request — so there's no cold-start latency (or failure) surprising your first real user. This is best-effort: if there's no internet access yet at startup (e.g. first deploy before DNS/networking is fully up), it logs a warning and falls back to lazy-loading on first request, exactly as before.

**Secrets.** The app refuses to start with `ENV=production` and a JWT secret that looks like a placeholder (contains "change", or is under 20 characters) — this catches both the app's own dev default and the example values shipped in `.env.example`/`docker-compose.yml`. Generate a real one with `openssl rand -hex 32`.

**Abuse hardening.** OTP requests are rate-limited per mobile number (`OTP_RESEND_COOLDOWN_SECONDS`, default 30s) on top of the existing per-code attempt limit — prevents spamming a number with verification codes.

**Container hardening.** Runs as a non-root user, has a Docker `HEALTHCHECK` hitting `/health`, and runs multiple Uvicorn workers (`WEB_CONCURRENCY`, default 4 — tune to your host's CPU count).

**Logging.** Structured logging is configured app-wide. Chatbot errors (bad API key, network failure, malformed model output) are now logged with full tracebacks and shown to users as a distinct "technical problem, try again" message — previously these were silently swallowed into the same message as a genuine no-match, which made real outages invisible. See `IMPLEMENTATION_GUIDE.md` for the full before/after on this.

---

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: 

pip install -r requirements.txt

cp .env.example .env
# edit .env: set GROQ_API_KEY (get a free key at https://console.groq.com)
# DATABASE_URL defaults to local SQLite — no Postgres needed for dev

uvicorn app.main:app --reload
```

API docs (Swagger): http://localhost:8000/docs
Tables are created automatically on startup for local dev (SQLite). For Postgres in production, use Alembic:

```bash
alembic revision --autogenerate -m "init"
alembic upgrade head
```

To (re)build the RAG index manually (also happens automatically on first chatbot query):

```bash
python -m rag.ingest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173. Vite is configured to proxy `/api` to `http://localhost:8000`.

---

## Running Tests

```bash
cd backend
source venv/bin/activate
pytest -v
```

Covers worker registration/login/auth guarding and the document wallet (upload/list/rename/delete, extension validation). RAG-service tests are excluded from the default/CI run since they require the Groq API key and the (large) sentence-transformers model download — see `rag/loader.py`'s standalone tests for the dependency-free parsing/chunking logic, which *is* covered.

---

## Adding a New Language

The system is intentionally **not hardcoded to 6 languages** — English, Hindi, Bengali, Telugu, Tamil, and Malayalam are the Phase-1 seeded set, but adding another is two steps:

1. Add a JSON file at `frontend/src/i18n/locales/<code>.json` (copy `en.json` as a template) and register it in `frontend/src/i18n/index.ts` and `frontend/src/i18n/languages.ts`.
2. Add the code to `SUPPORTED_LANGUAGES` in `backend/app/core/config.py`.

The chatbot needs no code change — Groq is instructed with the target language code directly, and the Web Speech API (voice) picks up the matching locale from the same registry (actual voice quality depends on the browser/OS's installed language packs).

---

## AI Welfare Assistant — How Grounding Works

1. The worker's question is embedded with a multilingual Sentence-Transformers model and matched against a FAISS index built from the government documents in `backend/rag/sample_docs/`.
2. If no chunk clears the similarity threshold (`RAG_MIN_SIMILARITY` in config, default `0.35`), the chatbot **immediately returns a "verified information not available" response** — it never falls back to the LLM's general knowledge.
3. If a relevant chunk is found, Groq is given *only* that retrieved text as context and instructed to answer strictly from it, in the requested language, as structured JSON.
4. Every grounded answer returned to the frontend includes: **answer, simple explanation, source document, government department, confidence score, last updated date** — sourced from the *document's* metadata (not the model's guess), so citations stay trustworthy even if the model hallucinates.

To add real content, drop more `.txt` files (same `TITLE:` / `DEPARTMENT:` / `LAST_UPDATED:` header format as the samples) into `backend/rag/sample_docs/` and rebuild the index with `python -m rag.ingest`.

---

## Grievance / Complaint System

Workers can file, track, and manage labour-rights complaints entirely on their own (Government-side review requires the Government portal, which is out of scope for this phase — see below).

- **File a complaint**: category (unpaid wages, workplace safety, harassment, illegal termination, document issue, employer dispute, insurance claim, accommodation, other), subject, description, optional employer name / location / incident date.
- **Track status**: `submitted → under_review → resolved / rejected`, plus `withdrawn` if the worker cancels it themselves. Every complaint gets a shareable reference number (`GR-XXXXXXXX`) independent of its internal id — useful when following up in person at a labour office.
- **Attach evidence**: up to 5 photos/PDFs per complaint, reusing the same storage abstraction as the document wallet.
- **Status timeline**: an append-only log of what happened and when, shown to the worker as a simple timeline.
- **Withdraw**: a worker can withdraw an open complaint at any time; withdrawn/resolved/rejected complaints become read-only (no further evidence uploads).

**Scope note:** only the Worker side is implemented, consistent with Phase 1's "Worker module only" boundary — the `Grievance` schema already supports `under_review`/`resolved`/`rejected` states and an extensible status-log/`changed_by` field so a future Government "Complaint Management" module can plug in without a breaking migration, but no Government auth or review UI exists yet to actually move a complaint through those states.

---

## OTP-Verified Registration & Full Migrant-Worker Profile

Registration now captures the details a migrant worker realistically needs for welfare-scheme eligibility, plus mobile number verification:

- **Identity**: full name, mobile, email (optional), date of birth, gender, Aadhaar number (optional — stored as provided, *not* verified against UIDAI; flagged in code as something to encrypt at rest before production use).
- **Current (work-site) address**: house/street, village/city, district, state, pincode.
- **Native/home address**: state + district — kept *separate* from the current address, since knowing a worker's home state matters for state-specific welfare schemes.
- **Occupation**: one of 10 categories (construction, domestic work, agriculture, textile/garment, factory, driver/transport, street vendor, security guard, hospitality, other) + years of experience.
- **Emergency contact**: name, relation, mobile number.

**OTP flow**: registration creates the account as inactive/unverified and sends a 6-digit OTP; login is blocked until the OTP is verified. This is entirely **free** — no SMS gateway account required. The default `ConsoleSMSProvider` logs the OTP server-side, and in dev mode (`DEBUG=true`) echoes it back in the API response so the whole flow is testable end-to-end with zero cost. Swap in a real provider later by implementing one method on the `SMSProvider` interface in `backend/app/services/otp_service.py` — nothing else changes. **Before shipping to real users, disable the dev-mode OTP echo** (it exists purely so this can be tested and demoed without a paid service).

---

## API Overview

Full interactive docs at `/docs` (Swagger) once the backend is running. Key endpoints:

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/worker/register` | Register a worker (multipart, full profile + optional photo); creates an inactive/unverified account and sends OTP |
| POST | `/api/v1/auth/worker/otp/request` | (Re)send OTP to a mobile number |
| POST | `/api/v1/auth/worker/otp/verify` | Verify OTP; activates the account and logs the worker in |
| POST | `/api/v1/auth/worker/login` | Login (blocked until phone is verified), returns JWT + worker profile + QR code |
| GET | `/api/v1/auth/worker/me` | Current worker profile |
| GET/PUT | `/api/v1/settings/language` | List/update preferred language |
| GET/POST | `/api/v1/documents` | List / upload documents |
| PATCH/DELETE | `/api/v1/documents/{id}` | Rename / delete a document |
| GET | `/api/v1/documents/{id}/download` | Download a document |
| POST | `/api/v1/chat/ask` | Ask the AI Welfare Assistant |
| GET | `/api/v1/chat/history` | Conversation history |
| GET | `/api/v1/grievances/categories` | List complaint categories |
| GET/POST | `/api/v1/grievances` | List / file a complaint |
| GET | `/api/v1/grievances/{id}` | Complaint detail (attachments + status timeline) |
| POST | `/api/v1/grievances/{id}/attachments` | Attach evidence (photo/PDF) |
| DELETE | `/api/v1/grievances/{id}/attachments/{attachment_id}` | Remove evidence |
| POST | `/api/v1/grievances/{id}/withdraw` | Withdraw a complaint |
| GET | `/api/v1/roles/{role}/status` | "Coming soon" status for non-worker roles |

---

## Mobile App (Expo / React Native)

A native Android/iOS app lives in `mobile/`, sharing this same backend. It covers the full Worker module — language select, OTP-verified registration, dashboard, document wallet, chatbot (text input; voice *output* via TTS), and the grievance system. See `mobile/README.md` for setup, including how to point the app at your backend from a physical phone.

---

## What's Deliberately Out of Scope for Phase 1

Per the product roadmap, only the **Worker** module is functional. Employer, Government/NGO, and Insurance portals return a "Coming Soon" screen by design — their database roles exist (`UserRole` enum) so Phase 2 won't need breaking schema changes, but no business logic is implemented for them yet. Employment timeline, salary ledger, complaint portal, and offline document viewing are also Phase 2+ per the roadmap and are not included here.
