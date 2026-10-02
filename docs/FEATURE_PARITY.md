# Feature-Parity Audit — Pitch vs Code

**Audited:** 2026-10-01 (report only) · **Implemented:** 2026-10-02 — all three
proposals below are now built, tested and verified end-to-end.

The project pitch names, among others: emergency **SOS**, **digital ID**,
**wage logging**, plus the AI assistant, grievances and the document wallet.
The last three existed end-to-end at audit time. This file records what was
missing then, what was built to close the gap, where it lives, and the honest
limitations that the UI keeps stating.

---

## 1. Emergency SOS — IMPLEMENTED (dashboard-delivery only)

**What was missing (audit evidence, 2026-10-01):** no SOS/alert model or route;
emergency contact fields existed on `User` but were never used by any feature;
no frontend button.

**What was built:**
- `server/src/models/SosAlert.js` — worker snapshot (id/name/mobile),
  `owner_state`/`owner_district` (mirrors the Grievance convention so the
  Phase-1 `grievanceScopeFilter` works verbatim), `location_text`, `note`,
  `status` (open|acknowledged), emergency-contact snapshot, `acknowledgements[]`.
- `server/src/routes/sos.js`, mounted at `/api/v1/sos`:
  `POST /` (worker JWT — snapshots contact + jurisdiction, returns
  `delivery: "dashboard_only"`), `GET /` (officials — scope-filtered list),
  `POST /:id/acknowledge` (per-document scope check → 403 outside
  jurisdiction; writes an audit log entry).
- Worker frontend: red **SOS** tile on `WorkerDashboardPage` opening a Modal
  with an honest `role="alert"` notice ("appears on officials' dashboards…
  does not send SMS or call anyone"), optional location/note, and a success
  state. No long-press — the confirm step inside the modal guards accidental
  taps instead.
- Government frontend: **SOS Alerts** tab on `GovernmentDashboardPage`
  (open alerts highlighted red, Acknowledge button, jurisdiction note, ack
  attribution). Uses `govGetSosAlerts` / `govAcknowledgeSos` in
  `frontend/src/api/governmentClient.ts`.
- i18n: `sos.*` keys in all 6 locales (en/hi/bn/te/ta/ml).

**Honest limitation (unchanged, stated in UI copy and API response):** no
SMS/push is delivered to anyone. The alert appears only on the officials'
dashboard and the emergency contact is recorded on the alert for manual
dialling.

## 2. Digital ID (QR) — IMPLEMENTED (frontend-only)

**What was missing (audit evidence):** `User.qr_code` was always null, nothing
generated a value, and `qrcode.react` was installed but never imported.

**What was built:**
- `WorkerDashboardPage.tsx` renders the ID-card QR client-side with
  `<QRCodeSVG value={worker.worker_id}>` — zero backend change, the reserved
  `qr_code` field stays null and documented as such.
- Honest scope: the QR encodes the **worker ID string only**. It is an offline
  identity helper, not a verifiable credential. Verifier-side scan-to-lookup
  remains a stretch goal.

## 3. Wage Logging — IMPLEMENTED

**What was missing (audit evidence):** no wage model/route anywhere; only the
`unpaid_wages` grievance category existed.

**What was built:**
- `server/src/models/WageEntry.js` — one entry per worker+date (unique index),
  `employer_name`, `agreed_amount`, `paid_amount`,
  `payment_status` (paid|unpaid|partial).
- `server/src/routes/wages.js`, mounted at `/api/v1/wages`:
  `GET /?month=YYYY-MM` (list), `GET /summary?month=YYYY-MM` (default last 90
  days; derives `total_unpaid`), `POST /` (validated upsert by UTC day —
  paid ≤ agreed, status auto-derived), `DELETE /:id` (ownership-scoped,
  cross-worker deletes are a no-op). Aggregate `$match` casts
  `req.userId` to ObjectId explicitly.
- Worker frontend `frontend/src/pages/WageLogPage.tsx` (route
  `/worker/wages`): summary header (days/agreed/paid/unpaid) for the selected
  month, add-entry form with client-side validation, monthly list with status
  badges, and a self-reported footnote.
- The viva-worthy integration: when the month has unpaid wages, a **"File
  unpaid wage complaint"** button deep-links to `GrievanceFormPage` with
  category `unpaid_wages`, subject and description pre-filled from the summary
  (via `location.state`; the form now initialises from it — no backend
  coupling).
- i18n: `wages.*` keys in all 6 locales.
- Honest limitation (stated in UI footnote): entries are self-reported by the
  worker; nothing is verified against an employer.

---

## Verification (2026-10-02)

| Check | Result |
|---|---|
| `npm test` (server) | **50/50** — 40 security + 10 new parity tests (`tests/parity.test.js`: wage upsert/validation/summary/ownership-delete/gov-403; SOS raise snapshot/worker-403-list/district-scoped list+ack/out-of-district-403/state scoping) |
| `npx tsc -b` + `npm run build` (frontend) | clean |
| `npm run verify` (live stack :8000/:8100) | **32/32** — 7 new live checks: wage upsert→partial, same-day upsert→paid (no dup row), summary totals, ownership delete, SOS raise (`delivery=dashboard_only`), gov scoped visibility, official acknowledge |

Known flake (pre-existing, unrelated to these features): the very first
`chat/ask` after a cold AI-service start can outlive the Node proxy's abort
window while the embedding model loads; a re-run passes. Worth a proxy timeout
bump or a startup prewarm later.
