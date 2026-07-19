# Project Status — Pharmacy Management System

**Last updated:** 2026-07-19 (i18n — English/French — shipped, partial coverage)
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

### Shipped this session (2026-07-19, part 13) — i18n (English/French), partial coverage by design
- **i18n** — another best-guess scope call, since this backlog item had no spec either.
  Chose **English + French specifically**, not an arbitrary language list: the schema
  already has `Patient.preferredLanguage`, and the seed data includes Quebec locations
  (regulatory body OPQ) — French isn't a nice-to-have there, it's a legal requirement for
  customer-facing software under Quebec's Charter of the French Language (Bill 96).
  Built `client/src/lib/i18n` from scratch (context provider + hook + flat dictionaries) —
  deliberately no i18n library, since a plain key→string lookup with an English fallback has
  no silent-failure mode worth outsourcing (unlike QR/PDF generation, where a from-scratch
  implementation was the wrong call).
  **Coverage is deliberately partial**: the persistent chrome (sidebar nav, user-box, role
  labels), Login, and Settings are fully translated as one complete, verifiable slice — a
  working demonstration of the pattern, not a claim that the whole app is bilingual. Most of
  the other ~25 pages remain English-only; extending coverage to a page is: import
  `useI18n`, wrap strings in `t('key')`, add the key to both dictionaries.
  Locale resolution: personal override (localStorage, same pattern as the existing dark-mode
  toggle) beats the system-wide default (`SystemSettings.defaultLocale`, owner-configurable)
  beats English. Switcher lives in the sidebar, the Login page, and a dedicated Settings
  section.
  **Important caveat to flag before any real Quebec rollout:** the French strings are a
  good-faith AI translation, not reviewed by a native French speaker or a Quebec compliance
  professional — treat them as a solid starting draft, not production-ready legal-grade
  copy.
  Verified in-browser via Playwright (translation bugs — a missing key, a wrong dictionary
  entry — are easy to introduce silently, so this got a real check despite being UI-only):
  switched to French pre-login, confirmed the Login page fully translates, logged in and
  confirmed the sidebar nav and role label are in French, confirmed the override survives a
  full page reload, confirmed the Settings page (heading, both panel titles, the maintenance
  toggle) is fully translated, then switched back to English from the Settings page and
  confirmed no French leftovers anywhere. Zero unexpected console errors (only the expected
  pre-login 401 from the best-effort system-default fetch, which fails silently by design).
  73/73 tests still pass (no server-side changes beyond none — this was a client-only
  feature).

### Shipped this session (2026-07-19, part 12) — custom fields (Patients) + a real patient form
- **Custom fields** — a best-guess scope since this backlog item had no explicit spec.
  `CustomFieldDefinition` model + migration (also adds `Patient.customFields Json`):
  TEXT/NUMBER/DATE/BOOLEAN/SELECT field types, owner-managed (new `custom_field:manage`
  permission, owner-only — 52 permissions now seeded, was 51). Scoped to **Patients only**,
  not Products — Products have no client edit UI at all, so building product custom fields
  would have meant inventing an unrelated product-management page just to have somewhere to
  put them. New `server/src/services/customFields.ts` (shared definition CRUD + value
  validation/merge logic) and `server/src/modules/customFields` (definitions API). New
  client `CustomFieldsEditor` component renders whatever active definitions exist — adding a
  field in the Admin console makes it appear on the patient form with zero client code
  change.
  **Bigger discovery while wiring this up: the Patients page had no working create/edit form
  at all** — "+ New patient" was a permanently-disabled stub, and there was no way to edit an
  existing patient either. Since the custom-fields feature needed a real form to attach to,
  built the actual create/edit flow (in-page panel, not a separate route, matching every
  other page's pattern this session).
  Verified thoroughly via live API: valid SELECT/TEXT values persist correctly, an invalid
  SELECT option 400s with the allowed list, an unknown custom-field key 400s (typos surface
  immediately rather than silently vanishing), a partial update preserves the other stored
  custom field (merge, not replace), deactivating a definition makes further writes to it
  400 (existing stored values aren't deleted, just frozen), and a non-owner gets 403 trying
  to manage definitions. Verified in-browser via Playwright: the patient form renders both a
  SELECT and a TEXT custom field driven by live server metadata, create→list→edit round-trips
  with the custom value correctly pre-filled, and the Admin panel's add/deactivate flow works
  — zero console errors in both passes. 38 unit + 35 integration tests (73/73) still pass,
  including the existing "pharmacist registers a patient" workflow test (no regression to
  patient creation).

### Shipped this session (2026-07-19, part 11) — on-demand DB backups (Admin console)
- **Backup creation/listing/download** — the last safely-buildable item off the "smaller
  roadmapped items" list. `POST/GET /admin/backups` + `GET /admin/backups/:filename/download`,
  `pg_dump` invoked via `execFile` with a fixed argv array (never a shell string — no
  command-injection surface) against the superuser `DIRECT_URL`. Deliberately built **only
  the safe half**: no restore-from-backup endpoint exists, because overwriting the live
  database is destructive enough that it shouldn't be a one-click API action without an
  explicit human decision at the time — see the caveats section below for the manual
  `pg_restore` procedure instead.
  Caught and fixed a real bug during verification: raw `pg_dump` rejects Prisma's `?schema=`
  connection-string query parameter outright (`invalid URI query parameter: "schema"`) — now
  stripped before use. Verified thoroughly: created a real backup and inspected it read-only
  with `pg_restore --list` (409 TOC entries, confirmed `Patient` TABLE DATA present — proving
  the superuser connection actually bypassed RLS rather than silently dumping zero patient
  rows), downloaded it and confirmed byte-for-byte size match, confirmed a path-traversal
  filename attempt gets a clean 400, confirmed a non-owner request gets 403, and confirmed
  in-browser (Playwright) that clicking "Create backup now" then "Download" produces a real
  file with the expected server-generated name. Admin page gained a "Database backups" panel.

### Shipped this session (2026-07-19, part 10) — PDF export
- **PDF export** for Finance (last buildable item off the Phase 4 export-formats gap; a real
  QuickBooks/Sage export still needs their exact target format spec, which isn't something
  to guess at). `GET /finance/expenses?format=pdf` (itemized report) and
  `GET /finance/pl?format=pdf` (P&L statement). Used the established `pdfkit` library rather
  than hand-rolling the PDF byte format — same reasoning as the QR code decision: a subtly
  wrong from-scratch implementation risks a corrupt file that's hard to notice without a
  dedicated check. Confirmed pdfkit added zero new npm audit findings (same 8 pre-existing
  dev-only advisories as before, all in vitest/vite/autocannon, unrelated).
  Verified past mere structural validity: fetched both PDFs live, confirmed `%PDF-`
  header/`%%EOF` trailer, then round-tripped them through a PDF text extractor (temporarily
  installed with `--no-save`, not part of the dependency tree) and confirmed the actual
  report content is correct — line-item amounts reconcile with the printed total
  ($700.60 + $8500.00 = $9200.60). Finance page gained "Export expenses PDF" and
  "Download P&L PDF" buttons. 38/38 unit tests still pass.

### Shipped this session (2026-07-19, part 9) — global search command palette + keyboard shortcut
- Discovered while scanning the "smaller roadmapped items" list: the Phase 7 `GET /search`
  API (`search:global` permission) had been backend-complete since that phase but had
  **zero client UI** — no page ever called it. Built `GlobalSearch`
  (`client/src/components/GlobalSearch.tsx`): a command palette opened via Ctrl/Cmd+K or a
  "Search" sidebar button, debounced query (250ms, 2-char minimum), grouped
  patients/prescriptions/products results. No entity in this app has a per-record detail
  page, so clicking a result navigates to the relevant list page (Patients/Prescriptions/
  Inventory), consistent with how the rest of the app already works. This also covers the
  "keyboard shortcuts" backlog item — combined into one well-scoped feature rather than a
  keyboard-shortcut system with nothing to attach it to.
  Verified in-browser via Playwright (new interaction pattern, worth the extra check despite
  the minimum-testing instruction): nav-button open, Ctrl+K open/toggle, Escape close,
  click-outside close, and result-click-navigates all confirmed working, zero console errors
  for a location-scoped user (the only errors seen were pre-existing/unrelated — the
  Inventory page's own owner-needs-a-location-picker 400s when testing as owner, not caused
  by this feature).

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
- [~] **On-demand backup creation/download — DONE** (Admin console, `pg_dump` via
  `execFile`). Still needed: automated/scheduled backups, point-in-time recovery, and a
  full DR runbook (restore is intentionally manual — see caveats section).
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
- [x] **Financial — AP aging, cash-flow forecast, budget variance, and PDF export all DONE.**
  Still left: QuickBooks/Sage export formats (need their exact format spec to build correctly).

### 6. Smaller roadmapped items
- [x] Dark mode / theming — **done this session**
- [x] Fine-grained "2h-after-due" overdue escalation — **done this session**
- [x] QR codes — **done this session**
- [x] Keyboard shortcuts — **done this session** (global search command palette, Ctrl/Cmd+K)
- [x] Backup UI — **done this session** (create/list/download only; restore stays manual by design)
- [x] Custom fields — **done this session** (Patients only; Products need a product-management
  UI to exist first)
- [x] i18n — **done this session** (English/French; chrome + Login + Settings translated,
  ~25 other pages still English-only — see "Shipped" for how to extend)

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
- **Backup restore is manual by design** (no API endpoint does this — see "Shipped" below
  for why). To restore a dump created via the Admin console's "Create backup now":
  `pg_restore --clean --if-exists --dbname="<DIRECT_URL, superuser>" path/to/backup.dump`.
  Test against a scratch database first, never directly against production.

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
