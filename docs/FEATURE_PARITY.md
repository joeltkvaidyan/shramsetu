# Feature-Parity Audit — Pitch vs Code (REPORT ONLY)

**Date:** 2026-10-01 · **Status:** audit only. Nothing here has been implemented;
each item below needs explicit go-ahead before any code is written.

The project pitch names, among others: emergency **SOS**, **digital ID**,
**wage logging**, plus the AI assistant, grievances and the document wallet.
The last three exist end-to-end. This file records, with evidence, which of
the headline features have no working route/model/page today, and proposes the
smallest honest version of each — scoped so it can be demoed in a viva without
overclaiming.

---

## 1. Emergency SOS — NOT IMPLEMENTED

**Evidence (grep across repo, 2026-10-01):**
- `server/src/routes/` has no SOS/panic/emergency route; `server/src/models/`
  has no SOS or alert model.
- The only "emergency" data in the system is the worker's **emergency contact
  name/relation/number**, captured at registration
  (`server/src/routes/auth.js` lines ~160-162, stored on `models/User.js`) and
  never used by any feature.
- No frontend SOS button, page or route exists.

**Proposed smallest version (worker → officials' dashboard):**
- `POST /sos` (worker JWT): stores `{ worker, location_text (optional),
  timestamp }` in a new `SosAlert` model, snapshots the worker's stored
  emergency contact onto the alert, and notifies all officials whose
  jurisdiction covers the worker (reuse the Phase-1 `grievanceScopeFilter`
  worker-resolution). Broadcast to the dashboard via the officials' next poll
  (no websockets needed for a demo).
- Frontend: a single SOS button on `WorkerDashboardPage` (long-press or
  3-second hold to avoid accidental taps) + a red "SOS alerts" panel on the
  government dashboard. Officer "acknowledge" writes an audit log entry
  (Phase-2 audit middleware already exists).
- Honest limitation: **no SMS/push is actually delivered** to the worker's
  emergency contact — there is no SMS provider configured. The alert appears
  only on the officials' dashboard and the emergency contact is recorded on
  the alert for manual dialling. The UI copy must say exactly that.

## 2. Digital ID (QR) — PARTIAL: ID exists, QR generation does not

**Evidence:**
- `models/User.js` has `qr_code: { type: String, default: null }` — **always
  null today**; nothing in `routes/` or `services/` ever generates a value.
- The worker dashboard renders `worker.qr_code` only when truthy
  (`WorkerDashboardPage.tsx` lines ~80-88) — so workers see the ID card and
  copy button, but **no QR code is ever displayed**.
- `frontend/package.json` ships `qrcode.react@^4.1.0` — **installed but never
  imported anywhere** (grep: 0 matches in `frontend/src`).
- The backend `qr_code` comment ("data URL (worker ID QR)") references a
  `qrcode` server dependency that Phase-4 cleanup removed from
  `requirements.txt` — that was the ai-service file; there is no `qrcode` dep
  in `server/package.json` today.

**Proposed smallest version (frontend-only, zero backend change):**
- Render the existing `worker_id` as a QR on the worker ID card with the
  already-installed `qrcode.react` (`<QRCodeSVG value={worker.worker_id}>`).
- Backend stays as-is: either leave `qr_code` null (frontend renders the QR
  client-side) or, one-liner, stop sending the misleading null field. Keep the
  `qr_code` model field documented as reserved.
- What the QR encodes must be honest: the **worker ID string only** — not a
  verifiable credential, not a government-validated token. Verifier-side
  lookup (an official scanning it to pull the worker's scope-filtered record)
  is a stretch goal and would need a scan page on the dashboard.

## 3. Wage Logging — NOT IMPLEMENTED (only a grievance category exists)

**Evidence:**
- No wage model or route anywhere in `server/src/` (grep `wage` matches only
  the `unpaid_wages` grievance category string and chatbot sample text).
- Frontend: `unpaid_wages` is the default category in `GrievanceFormPage`,
  a filter option in `GrievanceListPage`, and a translation string — no page,
  no entries, no summary.
- The i18n locales already carry `grievance.categories.unpaid_wages` in all
  6 languages, so the grievance linkage is pre-translated.

**Proposed smallest version (per-day wage log → pre-filled grievance):**
- `server/src/models/WageEntry.js`: `{ worker, work_date, employer_name,
  agreed_amount, paid_amount, payment_status (paid|unpaid|partial) }`
  (one entry per worker+date, upsert). `POST/GET/DELETE /wages` (worker JWT,
  ownership-scoped like documents).
- Worker frontend: a simple "Wage log" page — add-entry form and a monthly
  list; header summary `total agreed / total paid / total unpaid` for the
  selected month.
- The viva-worthy integration: a **"File grievance"** action on the unpaid
  summary that deep-links to `GrievanceFormPage` with category
  `unpaid_wages`, subject and description pre-filled from the unpaid entries
  (via query params or location state — no backend coupling).
- Honest limitation: entries are self-reported by the worker; nothing is
  verified against an employer. That is stated in the UI footnote.

---

## Effort summary (if approved)

| Feature | Backend | Frontend | New i18n keys |
|---|---|---|---|
| SOS | 1 route + 1 model + scope reuse | 1 button + 1 dashboard panel | ~6 × 6 langs |
| Digital ID QR | none (or 1-line model tweak) | 1 component on existing card | 0 |
| Wage log | 1 model + 3 routes | 1 page + pre-fill link | ~12 × 6 langs |

All three are additive — no change to existing API response shapes, no
restyling of existing screens.
