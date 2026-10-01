# ShramSetu — Security Notes (threat model & honest limitations)

Final-year project scope, stated plainly: what is enforced, what is not.

## Assets and who might attack them

| Asset | Threat actor | Main risk |
|---|---|---|
| Worker PII (mobile, Aadhaar-adjacent data, documents) | outsiders, insiders with DB access | identity theft, surveillance of migrants |
| Document wallet files | server compromise, DB dump theft | decryption without the master key |
| Worker sessions | token theft | account takeover |
| Government data boundaries | curious officials | cross-jurisdiction snooping |
| AI pipeline | prompt injection, PII leakage to third parties | manipulated answers, privacy loss |
| The service itself | scripted abuse | OTP spam, credential stuffing, DoS |

## Controls in place (with where to verify)

**Authentication & sessions**
- bcrypt password hashing; JWT with 12 h expiry.
- OTPs: 6 digits, hashed at rest, expiring, resend cooldown, printed **only
  to the server terminal** in dev (`OTP_ECHO_ENABLED`); production boot
  refuses echo mode.
- Unverified accounts cannot password-login; re-registration of an
  unverified number re-sends the OTP and never overwrites a verified
  account.
- `authenticate` re-checks user existence + `is_active` per request via a
  30 s cache; disabled users lose access immediately (within TTL); DB
  failure during the check → **503, never fail-open**.

**Authorization**
- Fail-closed jurisdiction scoping for every government route
  (`server/src/utils/scope.js`): superadmin → all; state/district officials
  → their jurisdiction; **no jurisdiction → zero rows**.
- Object access returns **404** (not 403) so out-of-scope records are not
  discoverable. Notification targeting rejects `all`/out-of-scope with 403.
- Worker JWTs are rejected on every government route; workers can only read
  their own grievances/documents (ownership checks).
- Locked in by `server/tests/security.test.js` (40 tests).

**Data protection**
- Document wallet: AES-256-GCM per file; per-file keys wrapped under
  `DOC_MASTER_KEY` (32-byte base64, env-only; production refuses to boot
  without it) — `wrapped:v1:` format, migration script included.
- Uploads: in-memory handling, magic-byte validation (PDF/JPEG/PNG/WEBP) +
  size + extension checks, temp-file cleanup on every failure path,
  RFC 5987 download filenames.
- PII (10-digit mobiles, 12-digit Aadhaar-like numbers) is stripped from
  chat text **before** any external AI provider call
  (`ai-service/app/services/pii.py`), applied to both text chat and voice
  transcription flows.

**Network & abuse**
- `helmet` security headers; CORS allowlist whenever `CORS_ORIGINS` is set.
- Rate limits: general API limiter plus strict per-route limiters (OTP
  request/verify, worker login, government login, register), env-tunable.
- AI service: requires `X-Internal-Key` (except `/health`), per-IP rate
  limit, request-size cap.

**Availability / operations**
- Production boot guard (`server/src/config.js assertProductionSafe`):
  refuses default admin password, OTP echo, demo seeding, missing master
  key/JWT secret, in-memory Mongo.
- Bootstrap admin is create-only (password never reset on boot).
- Audit log for government actions and auth events (actor, IP, success).

## Known limitations (honest list)

1. **No real SMS.** OTP delivery is a terminal printer. Production needs a
   gateway integration.
2. **No HTTPS termination here.** TLS must be handled by a reverse proxy or
   load balancer.
3. **Client-side document PIN lock is convenience only.** It gates UI
   access on a shared device; it is not encryption and provides no
   protection against someone with the worker's API token. The real
   protection is server-side encryption of stored files.
4. **Liveness cache window.** A deactivated user can keep working for up to
   30 s after deactivation (cache TTL); zero the TTL to trade performance
   for strictness.
5. **Single-node rate limiting.** Limits are in-process; a multi-node
   deployment needs a shared store (the AI service keeps a commented
   Redis hook).
6. **Chat attachments/voice rely on third-party AI providers** (Groq,
   Sarvam, Google) after PII stripping; workers consent explicitly at
   registration, but content is still processed outside the platform.
7. **Prompt-injection defence is layered but not absolute.** Retrieval-time
   injection questions are refused (measured 11/11 in the eval), and the
   system prompt carries no secrets, but generation-time hardening of a
   hosted LLM can never be guaranteed.
8. **Audit log is append-only within the app**, not tamper-evident (no
   hash chain / external sink).
9. **No backups/DR story** in this repository; a real deployment needs
   MongoDB backups and key-escrow procedures for `DOC_MASTER_KEY` (losing
   it makes every wallet file unrecoverable — by design).
10. **Eval coverage is retrieval-only** by default (no LLM key needed);
    generation-time grounding quality should be re-measured with `--full`
    when a key is available.

## Secrets handling

- All secrets live in gitignored `.env` files; `.env.example` documents
  them. The repo contains no committed secrets; uploads, logs, the FAISS
  index and model weights are gitignored.
- If a secret ever does leak: rotate `JWT_SECRET_KEY` (invalidates all
  sessions), rotate `DOC_MASTER_KEY` **only** with a re-wrap migration
  (otherwise wallet files become unreadable), and rotate the provider keys
  in the two `.env` files.
