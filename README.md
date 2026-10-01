# ShramSetu — AI-First Multilingual Welfare Platform for Migrant Workers

Final-year CSE project. ShramSetu connects migrant workers with government
welfare: OTP-verified registration (with explicit AI-processing consent), a
secure encrypted document wallet, grievance filing with tracking, a
jurisdiction-scoped government dashboard with notifications and audit logs,
and a **multilingual AI welfare assistant** — RAG over curated government
scheme documents — with **voice in/out**.

Supported languages: **English, Hindi, Bengali, Telugu, Tamil, Malayalam**.

## Architecture (polyglot microservices)

```
┌────────────────────────────────────────────────────────────┐
│  frontend/         React 18 + TypeScript + Vite + Tailwind │
│                    PWA · i18n (6 languages) · axios        │
└──────────────┬─────────────────────────────────────────────┘
               │ REST + JWT  (Vite proxies /api → :8000)
┌──────────────▼─────────────────────────────────────────────┐
│  server/           Node.js 22 + Express 4 + Mongoose 8     │
│  API + business logic: auth (OTP/password + rate limits),  │
│  fail-closed jurisdiction scoping, grievances, document    │
│  wallet (AES-256-GCM with wrapped keys), notifications,    │
│  government RBAC + audit logs, AI proxy (X-Internal-Key)   │
└───────┬───────────────────────────────┬────────────────────┘
        │                               │ X-Internal-Key
┌───────▼──────────┐          ┌─────────▼───────────────────┐
│  MongoDB         │          │  ai-service/   Python 3.10  │
│  (embedded dev   │          │  FastAPI :8100              │
│   instance or    │          │  · RAG: FAISS + multilingual│
│   real server)   │          │    embeddings + Groq LLM,   │
│                  │          │    similarity gate +        │
│  users·grievances│          │    citations + disclaimer   │
│  documents·notifs│          │  · STT: faster-whisper small│
│  audit·chat      │          │  · TTS: Sarvam / Google     │
└──────────────────┘          │  · PII stripped before any  │
                              │    external provider call   │
                              └─────────────────────────────┘
```

- **Node.js backend** (`server/`) — all CRUD/auth/business rules.
- **Python AI microservice** (`ai-service/`) — FAISS retrieval over curated
  government scheme documents (with per-document provenance: source URL,
  verification date, current/superseded status), Groq-grounded answers with
  citations and an "informational only, not legal advice" disclaimer,
  faster-whisper speech-to-text, Sarvam/Google text-to-speech, and
  Indic→English query translation (Google Translate / Sarvam cloud, with
  local IndicTrans2/NLLB fallbacks).
- **MongoDB** — Mongoose models; dev uses an embedded instance (zero
  install), production points `MONGODB_URI` at a real server.

Legal currency note: the four Labour Codes (Code on Wages 2019, Industrial
Relations Code 2020, Code on Social Security 2020, OSH Code 2020) came into
force on **21 November 2025**, replacing 29 earlier central Acts
([PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2192463)). The RAG
corpus reflects this: repealed-Act documents are marked `STATUS: superseded`
(kept for history, excluded from retrieval) and current-law documents cite
official sources. Repealed-Act docs that remain in the corpus carry a
"REPEALED — HISTORICAL INFORMATION ONLY" notice.

## Run it (development)

Prereqs: Node 22+, Python 3.10 (for the AI service).

### One command (Windows)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File start-all.ps1
```

Starts all services detached, **skipping any already running**, waits for
health checks, then prints the URLs:

| Service | URL | Notes |
|---|---|---|
| Node API | http://127.0.0.1:8000 | OTPs appear in the server terminal |
| AI service | http://127.0.0.1:8100 | first `/ask` or `/speak` warms models |
| Frontend (desktop) | http://127.0.0.1:5199 | |

Logs land in `shramsetu/logs/` (gitignored). Stop everything with
`powershell -NoProfile -ExecutionPolicy Bypass -File stop-all.ps1`
(kills only these services — MongoDB is untouched).

### Manual (any OS)

```bash
# 1) Backend  → http://127.0.0.1:8000
cd server
npm install
npm run dev
# OTPs print to THIS terminal and to logs/otp-dev.log (dev delivery only —
# the UI never shows or auto-fills the OTP)

# 2) AI service → http://127.0.0.1:8100   (first /ask or /speak downloads models)
cd ai-service
./venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8100   # Windows
#   venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8100          # macOS/Linux

# 3) Frontend → http://localhost:5199
cd frontend
npm install
npm run dev
```

`server/.env` and `ai-service/.env` hold dev values (see the matching
`.env.example` files). Both services need `AI_INTERNAL_KEY` (same random
value in both files) — the AI service rejects unauthenticated requests.
On boot the server auto-creates the bootstrap admin **create-only** (never
resets its password) and, when `SEED_DEMO_DATA=true` (dev default), seeds
demo workers/grievances if the users collection is empty.

## Demo credentials (development only)

| Role | Where | Credentials |
|---|---|---|
| Superadmin | `/government/login` | `ADMIN001` / `Admin@123` (sees everything + audit logs) |
| State official (Kerala) | `/government/login` | `KL001` / `Kerala@123` (sees all Kerala) |
| District official (Ernakulam) | `/government/login` | `EKM001` / `Ernakulam@123` (sees only Ernakulam) |
| Worker (password) | `/worker/login` → 🔑 tab | `9555500101` … `9555500110`, password `Worker@123` |
| Worker (OTP) | `/worker/login` → 📱 tab | any seeded mobile → OTP appears **only in the server terminal** |

## Tests and verification

| Suite | Command | Covers |
|---|---|---|
| Server unit/security | `cd server && npm test` | 40 tests: scoping, ownership, upload crypto, rate limits, auth hardening |
| End-to-end checks | `cd server && npm run verify` | 25 live checks across both services |
| AI service | `cd ai-service && venv/Scripts/python -m pytest` | 35 tests: corpus integrity, loader, RAG contract, PII, prompt injection |
| RAG eval harness | `venv/Scripts/python eval/run_eval.py` | hit@1/hit@3, retrieval refusals, per-language → `eval/RESULTS.md` |

## Production notes (honest scope)

Not production-ready as-is; it is production-*oriented*. With
`ENV=production` the server **refuses to boot** unless `JWT_SECRET_KEY` is
set, `BOOTSTRAP_ADMIN_PASSWORD` is changed from the default,
`OTP_ECHO_ENABLED=false`, `SEED_DEMO_DATA=false`, `DOC_MASTER_KEY` is set
and `MONGODB_URI` is not the in-memory instance.

Still needed for a real deployment:
- A real SMS gateway for OTP delivery (the terminal printer in
  `server/src/routes/auth.js` must be replaced), and real HTTPS/TLS
  termination.
- Object storage with server-side encryption for uploads if running multi-node.
- The AI service needs a free Groq API key (console.groq.com) for grounded
  LLM answers; retrieval and honest refusals still work without it.
- Push notifications (FCM) and persistent media for chat/attachments.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/SECURITY.md](docs/SECURITY.md) (threat model + known limitations) and
[WORKFLOW.md](WORKFLOW.md) (code walkthrough for the viva).
