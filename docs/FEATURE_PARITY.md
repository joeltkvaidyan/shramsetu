# Feature-Parity Audit — Pitch vs Code

**Audited:** 2026-10-01 (report only) · **Implemented:** 2026-10-02 — all three
proposals below are now built, tested and verified end-to-end.

The project pitch names, among others: **digital ID**, **wage logging**,
plus the AI assistant, grievances and the document wallet.
The last three existed end-to-end at audit time. This file records what was
missing then, what was built to close the gap, where it lives, and the honest
limitations that the UI keeps stating.

> **Note (2026-10-06):** the emergency **SOS** feature that was built as
> proposal 1 has since been **removed** at the user's request — worker tile,
> government tab, `/api/v1/sos` route and `SosAlert` model, tests, and i18n
> keys are all gone. The two remaining proposals below are unaffected.

---

## 1. Digital ID (QR) — IMPLEMENTED (frontend-only)

**What was missing (audit evidence):** `User.qr_code` was always null, nothing
generated a value, and `qrcode.react` was installed but never imported.

**What was built:**
- `WorkerDashboardPage.tsx` renders the ID-card QR client-side with
  `<QRCodeSVG value={worker.worker_id}>` — zero backend change, the reserved
  `qr_code` field stays null and documented as such.
- Honest scope: the QR encodes the **worker ID string only**. It is an offline
  identity helper, not a verifiable credential. Verifier-side scan-to-lookup
  remains a stretch goal.

## 2. Wage Logging — IMPLEMENTED

**What was missing (audit evidence):** no wage model/route anywhere; only the
`unpaid_wages` grievance category existed.

**What was built:**
- `server/src/models/WageEntry.js` — one entry per worker+date (unique index),
  `employer_name`, `agreed_amount`, `paid_amount`,
  `payment_status` (paid|unpaid|partial).
- `server/src/routes/wages.js`, mounted at `/api/v1/wages`:
  `GET /?month=YYYY-MM` (list), `GET /summary?month=YYYY-MM` (default last 90
  days; derives `total_unpaid`), `POST /` (validated upsert by UTC day —
  paid ≤ agreed, status auto-derived; **409 `wage_paid_locked` once a day is
  fully paid** — a settled day can no longer be edited), `DELETE /:id`
  (ownership-scoped, cross-worker deletes are a no-op). Aggregate `$match`
  casts `req.userId` to ObjectId explicitly.
- Worker frontend `frontend/src/pages/WageLogPage.tsx` (route
  `/worker/wages`): summary header (days/agreed/paid/unpaid) for the selected
  month, add-entry form with client-side validation, monthly list with status
  badges, and a self-reported footnote.
- The viva-worthy integration: when the month has unpaid wages, a **"File
  unpaid wage complaint"** button deep-links to `GrievanceFormPage` with
  category `unpaid_wages`, subject and description pre-filled from the summary
  (via `location.state`; the form now initialises from it — no backend
  coupling).
- Paid-day lock mirrored in the UI: `WageLogPage` refuses to submit an edit
  for a date already stored as `paid` and shows the localised `wages.paidLocked`
  message (also mapped from the API's 409).
- i18n: `wages.*` keys in all 6 locales.
- Honest limitation (stated in UI footnote): entries are self-reported by the
  worker; nothing is verified against an employer.

---

## Verification (2026-10-02)

| Check | Result |
|---|---|
| `npm test` (server) | **49/49** — 43 security/scope + 6 parity tests (`tests/parity.test.js`: wage upsert/validation/summary/paid-day lock/ownership-delete/gov-403; security suite adds the superadmin officials-monitoring view: correct scope counts + 403 for state/district/stateless/worker JWTs) |
| `npx tsc -b` + `npm run build` (frontend) | clean |
| `npm run verify` (live stack :8000/:8100) | **34 checks** — live checks include: wage upsert→partial, same-day upsert→paid (no dup row), summary totals, paid day locked (edit after paid → 409), ownership delete, SOS route removed (404), superadmin officials list with jurisdictions, state official blocked from enumerating officials (403). Expects the seeded dataset (10 workers) — a stray test registration makes the three seed-count checks fail until `npm run demo:reset` |

Known flake (pre-existing, unrelated to these features): the very first
`chat/ask` after a cold AI-service start can outlive the Node proxy's abort
window while the embedding model loads; a re-run passes. Worth a proxy timeout
bump or a startup prewarm later.
