# Project Status — Pharmacy Management System

**Last updated:** 2026-07-19 (QR code generator shipped)
**Canonical "where are we / how to resume" doc.** Read this first in any new session.
Detailed step plan lives in [`ROADMAP.md`](./ROADMAP.md).

---

## TL;DR — where we are

All **feature phases (1–5 core spec + 7–11 expanded platform) are code-complete,
verified end-to-end against a live PostgreSQL database, and have client UIs.**
The backend runs as a least-privilege role with PostgreSQL row-level security
actively enforcing patient-location isolation. What remains is **Phase 6
(QA / hardening / go-live)** and **production integrations + sign-offs** — mostly
process and external-service work, not core feature code.

Stack: React 19 + TS (`client/`) · Node + Express + TS (`server/`) · PostgreSQL 17
via Prisma · JWT auth (role + location claims). Repo:
https://github.com/ShahbazAli206/pharmacy_management_system (branch `main`).

---

## ✅ DONE (committed + verified)

| Phase | Scope | Status |
|---|---|---|
| **1 Foundation** | Auth, DB-backed RBAC, **RLS (active at runtime)**, MFA/TOTP, password reset, patient CRUD + allergy/condition sub-resources, 35 unit tests, OpenAPI/Swagger | ✅ Complete · client ✅ |
| **2 Core Pharmacy** | Catalog, inventory (lots/FEFO/expiry/low-stock/auto-PO), Rx workflow + interaction engine (409 block), dispense/refills, POS (HST, Rx zero-rated), cash reconciliation | ✅ Smoke 36/36 · client ✅ · **POS page (new)** |
| **3 Compliance & Narcotics** | Checklists (idempotent, signature-required), narcotics register + **discrepancy lock (423)** + resolve, recall ingest→quarantine, license/permit expiry, compliance score, audit viewer | ✅ Smoke 25/25 · client ✅ |
| **4 Financials** | Expense workflow (**no self-approval**), P&L per-location + consolidated, profit distribution (basis points), CRA HST/GST summary, renewals, CSV export | ✅ Smoke 23/23 · client ✅ |
| **5 Camera & Comms** | Camera registry + heartbeat + role-scoped grid, messaging + owner broadcast (**no cross-location leakage**), CASL refill reminders + dispatch (stub provider) | ✅ Smoke 23/23 · client ✅ · **Messages page (new)** |
| **7 Platform** | Feature flags (global + per-pharmacy override), global search, system health | ✅ Smoke · client ✅ (Admin) |
| **8 Docs/e-sign/import** | Document manager (pluggable storage), e-signature, CSV bulk import (per-row errors) | ✅ Smoke · **client ✅ (new)** |
| **9 Config/ops** | System settings (≥10y retention enforced), maintenance mode, notification prefs | ✅ Smoke · **client ✅ (new)** |
| **10 Reporting** | sales-by-day / expenses-by-category / Rx-volume / **sales forecast**, saved reports | ✅ Smoke · **client ✅ (new)** |
| **11 Workflow/admin** | Generic approval engine (no self-approval), role simulator, activity timeline, Code39 barcode | ✅ Smoke · **client ✅ (new)** |

**Infra done:** live PostgreSQL 17 (portable, `:5433`), **4 migrations applied** (incl.
`inter_pharmacy_transfers`), seed run (16 pharmacies + full permission matrix), **RLS
runtime cutover active** (app connects as `pharmacy_app`).

**Verification:** every backend phase driven end-to-end against the live DB; Phases 8–11
client UIs driven in real Chrome (Playwright) — 17/17. 35 vitest unit tests pass, plus
**35 HTTP-level integration tests** (supertest vs live DB, RLS active) covering
auth/RBAC/location-scoping + a core clinical workflow.

**Bug fixes found & shipped during verification:** `ffc4e9d` (narcotics receipt on
controlled-stock receive), `f1761df` (maintenance-mode lockout), owner location-picker
for location-scoped writes (`76bbea3`).

### Shipped this session (2026-07-19, part 8) — QR code generator
- **QR codes** (last item off the "smaller roadmapped items" list besides i18n/backup-UI/
  custom-fields/keyboard-shortcuts): added the small, dependency-free `qrcode-generator`
  package rather than hand-rolling QR encoding — QR needs real Reed-Solomon error
  correction and mask-pattern selection (unlike Code39's simple bar-width scheme), and a
  subtly-wrong implementation would produce codes that look right but don't scan, with no
  way to catch that without a physical/decoder test. `GET /admin/qrcode` renders the
  library's module matrix to our own SVG (same approach as the existing barcode renderer).
  Verified structurally — valid module count, all three finder patterns byte-for-byte
  correct per the QR spec — plus a live API smoke test. Admin page's barcode tool gained a
  Code39/QR format toggle. 3 new unit tests (38/38 unit tests passing).

### Shipped this session (2026-07-19, part 7) — security audit + fine-grained compliance escalation
- **Internal security review** (Phase 6 hardening item — precedes a real external pentest, not
  a replacement for one): a full-codebase audit across authz, injection, IDOR, secrets/crypto,
  file handling, and auth edge cases found **no Critical/High issues**. Two Low findings, both
  fixed same session:
  - `transfers.service.ts` approve/reject/cancel never checked the fetched transfer's
    from/to-location against the caller — harmless today only because those routes are
    gated to owner-only `PHARMACY_MANAGE`, but a latent cross-location IDOR if that
    permission is ever also granted to a location role. Added a defensive
    `assertTransferAccess` check (must belong to fromPharmacyId or toPharmacyId).
  - `/admin/timeline` required only authentication, not an audit-read permission — any
    authenticated role (e.g. a cashier) could query audit-log metadata for entities they
    have no read permission on (e.g. PerformanceReview), even though it was already
    location-scoped. Now gated behind `audit:read:all`/`audit:read:location`. Verified live
    (cashier now 403s).
  - Everything else checked out: RLS/location-scoping consistent across every module, no raw
    SQL string interpolation, no `Math.random` in any token path, mass-assignment guarded
    (`pharmacyId` on patient update never trusts the client), MFA/password-reset/refresh-token
    flows correct.
- **Fine-grained compliance escalation** (last Phase 3 gap): `ComplianceRecord.dueAt` column
  (migration `compliance_due_at`, backfilled for existing rows) replaces the end-of-day
  overdue boundary with a real 2-hours-past-due-time rule. Verified live: escalation sweep
  correctly flips only genuinely-2h-overdue tasks, leaving same-day-but-not-yet-due tasks
  PENDING.
- 35 unit + 35 integration tests still pass (70/70) after all of the above.

### Shipped this session (2026-07-19, part 6) — financial extras (cash-flow forecast + budget variance), API-verified
- **Budget variance report & cash-flow forecast** (last two items in the Phase 4 financials
  backlog besides export formats): `PUT/GET /finance/budgets` (reuses the existing `Budget`
  model — no migration needed), `GET /finance/budget-variance` (budgeted vs. actual by
  category for a month), `GET /finance/cash-flow-forecast` (6-month history + 3-month
  projection, same moving-average + linear-trend method as the Phase-10 sales forecast).
  Finance page gained both panels plus an inline budget-setting form. Verified via live API
  (set budget → variance reflects real expense data correctly); caught and fixed a UTC
  month-bucketing bug during verification (a server running in a negative UTC offset was
  shifting `"2026-07-01"` back into June when reconstructing the month boundary via local
  date components). 35 unit tests still pass; no browser pass this round per your
  minimum-testing instruction — flagging that as a gap if you want the UI itself exercised.

### Shipped this session (2026-07-19, part 5) — HR performance reviews, browser/API verified — HR module complete
- **New feature — Performance reviews (spec §11 HR follow-on, the last unbuilt HR sub-area):**
  `PerformanceReview` model + migration (`hr_performance_reviews`), `REVIEW_READ`/
  `REVIEW_MANAGE` permissions (owner/partner/PIC draft, submit, and view team reviews), new
  `server/src/modules/reviews` (create/list-mine/list-team/update/submit/acknowledge,
  location-scoped, audit-logged). Workflow: manager drafts a review (hidden from the employee
  while DRAFT) → submits it (now visible to the employee) → employee self-service
  acknowledges → the review locks against further edits. **Client: Performance Reviews page**
  — draft form, "my reviews" with acknowledge, team reviews table with submit. Verified via
  live API (full draft→submit→acknowledge→edit-blocked lifecycle, plus RBAC 403s for a
  non-manager role on both draft and team-list) and in-browser (Playwright: nav link, form,
  and a real acknowledged review rendering correctly in the team table). 51 permissions now
  seeded (was 49). **This completes the entire spec §11 HR module.**

### Shipped this session (2026-07-19, part 4) — HR training/CE tracking, browser/API verified
- **New feature — Training/CE tracking (spec §11 HR follow-on, last unbuilt slice besides
  performance reviews):** `TrainingRecord` model + migration (`hr_training_records`),
  `TRAINING_READ`/`TRAINING_MANAGE` permissions (owner/partner/PIC view team + expiring-soon
  report; self-logging is open to every role), new `server/src/modules/training`
  (log/list-mine self-service, manager on-behalf-of logging with a location-membership guard,
  location-scoped team list, and a 30/60/90-day expiring-credential report reusing the Phase-3
  license-expiry bucket pattern). **Client: Training & CE page** — log-record form (toggle
  self vs. on-behalf-of a team member), expiring-soon panel, "my training history", team
  records table. Verified via live API (log→mine→team-list→expiring, invalid-target-user 400)
  and in-browser (Playwright: nav link, page renders, form submit updates the table, zero
  console errors from app code). 49 permissions now seeded (was 47).

### Shipped this session (2026-07-19, part 3) — HR incident reports, browser/API verified
- **New feature — Incident reports (spec §11 HR follow-on):** `IncidentReport` model + migration
  (`hr_incident_reports`), `INCIDENT_READ`/`INCIDENT_MANAGE` permissions (owner/partner/PIC
  triage; filing itself is self-service, open to every role), new
  `server/src/modules/incidents` (file/list-mine self-service, location-scoped list + update +
  resolve + close for managers, audit-logged), and an **Incident Reports client page** (report
  form, "my reports", manager triage table with resolve/close, owner location + status filters).
  Verified via live API (file→list→resolve→close, RBAC gate on the manager endpoints) and
  in-browser (Playwright: nav link, page renders, form submit produces a new row, zero console
  errors). 47 permissions now seeded (was 45).

### Shipped this session (2026-07-19, part 2) — HR scheduling, browser/API verified
- **New feature — Shift scheduling (spec §11 HR follow-on):** `Shift` model + migration
  (`hr_scheduling`), `SHIFT_READ`/`SHIFT_WRITE` permissions wired into every role, new
  `server/src/modules/scheduling` (list/create/update/publish/cancel, location-scoped,
  audit-logged), and a **Scheduling client page** (my-shifts, create-shift form, 14-day team
  schedule with publish/cancel). Verified via live API calls (create/publish/cancel, cross-role
  RBAC: cashier read-only vs partner/PIC read-write, audit trail present) and in-browser
  (Playwright: nav link, both sections render, zero console errors, Cancel button works live).

### Shipped this session (2026-07-19, part 1) — all committed + browser/API verified
- **Phase 6 QA:** 35 HTTP integration tests (`test:integration`) + 200-user load test
  (`loadtest`, p99 ~1.9s / 0 errors); rate limits made env-tunable.
- **New client pages** (every backend module now has a UI): Point of Sale, Messages
  (+ broadcast), Prescribers, Narcotics register, Recalls/quarantine, Notifications queue,
  and **Staff / user management**.
- **New feature — Inter-pharmacy transfers:** `StockTransfer` model + migration, request →
  owner approval → atomic FEFO move; controlled-substance registers balanced. New
  `GET /pharmacies` directory + `POST/GET/PATCH /users` staff endpoints.
- **UI:** persisted dark mode + theme tokens; fixed `.btn-ghost` contrast bug.
- **Dashboards fully wired to real data:** owner + location dashboards now show real today's
  revenue (POS sales), prescription volume, reorder/low-stock + expiry alerts, **per-location
  compliance band** (from `complianceScore`), the **compliance checklist** progress, and
  active-prescription count — all reusing existing module helpers, no schema change. Only
  `pendingPartnerReports` stays `0` by design (no partner-reports feature exists yet).

---

## 🔲 LEFT (prioritized)

### 1. Phase 6 — QA & Hardening / Go-Live (the main remaining work)
- [x] **Integration tests (HTTP-level) for auth/RBAC/scoping + core workflow — DONE.** 35 supertest tests drive the real app against the live DB with RLS active (`cd server && npm run test:integration`). Covers login/refresh-rotation/logout/`/me`, owner-only 403-vs-200 RBAC, partner location isolation (RLS-invisible → 404), and a patient→allergy→dashboard→inventory→audit workflow. Unit tests remain `npm test` (35, DB-independent); `npm run test:all` runs both.
- [x] **Load test — 200 concurrent users — DONE.** autocannon harness `cd server && npm run loadtest` (needs DB up). Boots the app in-process with rate limiting disabled, drives 200 concurrent connections over a real read mix, and gates on p99 < 3s + zero errors. Local baseline: ~215 req/s, p99 ~1.9s, 0 errors/non-2xx. Rate limits are now env-tunable (`RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_MAX`, 0 = disabled).
- [~] **Internal security code review — DONE** (authz/injection/IDOR/secrets/crypto/auth
  sweep; no Critical/High findings, two Lows found and fixed same session — see "Shipped").
  A real external penetration test is still needed before production; an internal review is
  not a substitute.
- [ ] Pharmacist UAT, training, phased rollout, DR drills

### 2. Real external integrations (currently pluggable stubs — need creds/services)
- [ ] OCR (Google Vision / AWS Textract) · [ ] Storage (real S3/Azure Blob)
- [ ] SMS/email (Twilio / SendGrid) · [ ] E-signature (DocuSign / Adobe Sign)
- [ ] Insurance adjudication (TELUS Health, etc.) · [ ] Payments (Moneris / Square)
- [ ] Payroll (Ceridian / ADP) · [ ] Health Canada DIN DB + scheduled MedEffect recall poll
- [ ] Bull/Redis job queue · [ ] WebRTC/HLS camera streaming
- [ ] PDF / QuickBooks / Sage export formats

### 3. Production readiness
- [x] **CI/CD — DONE.** `.github/workflows/ci.yml`: server job (Postgres service container,
  migrate deploy, seed, typecheck, unit + integration tests) and client job (typecheck,
  build), on every push/PR to `main`. Verified green on GitHub Actions.
- [ ] Canadian-residency hosting (AWS ca-central-1 / Azure Canada), TLS 1.3
- [ ] Rotate secrets before prod: `pharmacy_app` DB password, JWT secrets, `FIELD_ENCRYPTION_KEY`
- [ ] Backup / point-in-time recovery / DR runbook
- [ ] Managed PostgreSQL (replace the local portable instance)

### 4. Compliance sign-off gates (before production — non-negotiable per spec)
- [ ] Canadian pharmacy regulatory consultant review of the compliance module
- [ ] Privacy-lawyer review for PIPEDA + provincial acts
- [ ] Pharmacist UAT sign-off

### 5. Larger functional gaps (new build needed)
- [x] **HR — attendance/clock-in DONE** (`Attendance` model + migration, `/attendance` clock-in/
  out/me + team log, Attendance page).
- [x] **HR — shift scheduling DONE** (`Shift` model + migration, `/scheduling` list/create/update/
  publish/cancel + `/me`, Scheduling page).
- [x] **HR — incident reports DONE** (`IncidentReport` model + migration, `/incidents`
  file/mine/list/update/resolve/close, Incident Reports page).
- [x] **HR — training/CE tracking DONE** (`TrainingRecord` model + migration, `/training`
  log/mine/list/expiring, Training & CE page).
- [x] **HR — performance reviews DONE** (`PerformanceReview` model + migration, `/reviews`
  create/mine/list/update/submit/acknowledge, Performance Reviews page). **HR module (spec
  §11) is now fully built.**
- [x] **Financial — AP aging DONE** (`/finance/ap-aging` + Finance panel). **Cash-flow
  forecast + budget variance DONE this session.** Still left: PDF/QuickBooks export.

### 6. Smaller roadmapped items
- [x] Dark mode / theming — **done this session**
- [x] Fine-grained "2h-after-due" overdue escalation — **done this session**
- [x] QR codes — **done this session**
- [ ] i18n · backup-restore UI · custom fields · keyboard shortcuts

---

## ▶️ How to resume (exact steps)

The local database is a **portable PostgreSQL — NOT a Windows service**, so it does
**not** auto-start. Each session:

**1. Start the database (PowerShell):**
```powershell
& "D:\Projects\Pharmecy_App\.localdb\pgsql\bin\pg_ctl.exe" -D "D:\Projects\Pharmecy_App\.localdb\data" -l "D:\Projects\Pharmecy_App\.localdb\server.log" -o "-p 5433" start
```

**2. Start the backend API** (from `server/`): `npm run dev` → http://localhost:4000
(Swagger at `/api/docs`, spec at `/api/docs.json`)

**3. Start the client** (from `client/`): `npm run dev` → http://localhost:5173

**Seed logins** (password `ChangeMe123!`): `owner@pharmacy.ca` (System Owner),
`partner1@pharmacy.ca` (Location Partner, Toronto), `pic1@pharmacy.ca` (Pharmacist-in-Charge).

**Verify quickly:** `curl http://localhost:4000/api/health` → `{"status":"ok"}`.
Run tests: `cd server && npm test` (35 unit, DB-independent). Integration tests
(need DB up + seeded): `npm run test:integration` (35). Both: `npm run test:all`.
Typecheck: `npm run typecheck`.

---

## ⚠️ Key facts / caveats (don't get caught out)

- **RLS is active.** The app connects as non-superuser `pharmacy_app`. `server/.env`
  has `DATABASE_URL` (pharmacy_app, runtime) **and** `DIRECT_URL` (postgres superuser).
  **Migrations & seed must use the superuser** — `prisma migrate` uses `DIRECT_URL`
  automatically; run `db:seed` with `DATABASE_URL` pointed at the postgres URL.
- **Lazy-promise gotcha:** any code querying patient tables *outside* an HTTP request
  must `await` **inside** `rlsStorage.run(ctx, …)`, or it hits the fail-closed default
  and sees zero rows. All request paths already handle this via the auth middleware.
- **Secrets are dev-only** and live in the gitignored `server/.env` (not committed).
  Rotate before any real deployment.
- `.localdb/` (the portable Postgres binaries + data) is gitignored — it stays on this
  machine and won't travel via git.

---

## 👉 Suggested next step

The **buildable UI backlog is clear** — every backend module has a client page (see "Shipped
this session"). Pick one of the remaining directions, in rough priority:

1. **HR module (spec §11) — DONE.** Attendance, scheduling, incident reports, training/CE,
   and performance reviews are all shipped. No HR gaps remain.
2. **Financial extras** — cash-flow forecast, budget variance, PDF/QuickBooks export.
3. **Wire a real external provider** behind an existing stub (S3 / Twilio / SendGrid / OCR /
   insurance / payments) — *blocked on credentials*.
4. **Go-live hardening** — penetration/security review (`/security-review`), managed Postgres,
   CI/CD, backup/DR, secret rotation; then the compliance/privacy/pharmacist sign-off gates.

Testing infra in place: `npm test` (35 unit) · `npm run test:integration` (35) ·
`npm run loadtest` (200 users) · `npm run typecheck`.
