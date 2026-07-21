# Pharmacy Management System — Development Roadmap

A step-by-step build plan derived from `functionalitylist.txt` and the source
requirements doc. Each step is concrete and ordered by dependency. Checkboxes
track real progress.

**Stack:** React + TypeScript (frontend) · Node.js + Express + TypeScript (backend) ·
PostgreSQL (Prisma ORM) · Redis (cache/queues, later) · JWT auth with role + location claims.

**Repo layout (monorepo):**
```
Pharmecy_App/
  server/     Express + TS API, Prisma schema, migrations
  client/     React + TS web app (added in Phase 1 dashboards step)
  shared/     Shared TS types (roles, permissions, DTOs)  [optional]
```

---

## PHASE 1 — Foundation (spec Months 1–3)  ← COMPLETE

### 1.1 Project scaffold & tooling
- [x] Backend project: `server/` with Express + TypeScript, tsconfig, scripts.
- [x] Environment config via `.env` (validated with zod at boot).
- [x] Prisma ORM setup + connection via `DATABASE_URL`.
- [x] Central error handling, request logging (morgan), security middleware (helmet, cors, rate-limit).
- [x] Health-check endpoint + graceful-shutdown boot script.

### 1.2 Multi-location data model (design for 50 locations)
- [x] `Pharmacy` (location) — province, regulatory body, address, status.
- [x] `User` — role, `pharmacyId` (null for owner), MFA fields, password hash, license.
- [x] `Role` + `Permission` + `RolePermission` — centralized permission matrix (DB, not hardcoded).
- [x] `Patient` — profile + field-level encrypted PII (health card, insurance) + allergies/conditions.
- [x] `AuditLog` — append-only (user, pharmacy, action, entity, entityId, ip, ua).
- [x] Seed script: 16 pharmacies, owner + sample staff, full permission matrix.
- [x] Run initial migration against a live PostgreSQL DB (portable PG17 on `:5433`; migration `20260718144534_init` applied, seeded, login + owner dashboard verified end-to-end).

### 1.3 Authentication
- [x] Login with hashed passwords (bcryptjs, 12 rounds).
- [x] JWT issuance with `role` + `locationId` claims; refresh-token rotation (hashed at rest).
- [x] Logout (refresh-token revocation).
- [x] 15-minute access-token TTL (inactivity timeout baseline).
- [x] MFA (TOTP): setup/enable/disable endpoints, encrypted secret, login enforced (`MFA_REQUIRED`); otplib-backed, E2E-verified.
- [x] Password reset flow: hashed single-use tokens (1h TTL), stub-email dispatch, refresh-token revocation on reset; E2E-verified.

### 1.4 RBAC enforcement layer
- [x] Auth middleware: verify JWT, load live permissions, attach user context.
- [x] `requirePermission()` / `requireAnyPermission()` backed by the DB permission matrix.
- [x] Location-scoping helpers (`assertLocationAccess`, `resolveLocationScope`) — cross-location blocked at API layer.
- [x] Audit service: logs data-access events (login, patient read/write/create/export).

### 1.5 Patient records CRUD (Phase-1 slice)
- [x] Create/read/update/list patients, scoped to pharmacy.
- [x] Field-level AES-256-GCM encryption for health card + insurance IDs (round-trip + tamper-detection verified).
- [x] Allergies/ADR + chronic conditions modelled and returned with patient.
- [x] Access logging on every patient read/list.
- [x] Allergy/condition write sub-resource endpoints (POST/DELETE under `/patients/:id`, location-scoped + audited).

### 1.6 Basic dashboards
- [x] Owner consolidated overview endpoint (real location/staff/patient counts; revenue/compliance stubbed for later phases).
- [x] Partner scoped dashboard endpoint (own location only).
- [x] React (Vite) client scaffold; login screen; role-based routing + protected routes.
- [x] Owner vs. partner dashboard views from a single codebase (JWT/permission-driven render).
- [x] API client with automatic refresh-token rotation on 401; patients list page.

### 1.7 Phase-1 hardening
- [x] PostgreSQL row-level security **(actively enforced at runtime)**: FORCE RLS policies on Patient/Allergy/ChronicCondition + least-privilege `pharmacy_app` role, keyed on `app.is_owner`/`app.pharmacy_id` GUCs. The app connects as `pharmacy_app`; a Prisma client extension + AsyncLocalStorage set the GUCs per request (auth middleware) on every query/transaction, so a partner literally cannot read or write another location's patient data at the DB layer. Verified end-to-end (owner sees all, partner scoped, cross-location blocked, fail-closed default). Migrations/seed use a superuser via `DIRECT_URL`.
- [x] Unit/integration tests for auth + RBAC + patient scoping (vitest, DB-independent) — 35 tests passing (was 12).
- [x] API documentation (OpenAPI 3 at `/api/docs.json`, Swagger UI at `/api/docs`; zero new deps).

Legend: [x] done · [~] partial · [ ] not started

---

## PHASE 2 — Core Pharmacy (Months 4–6)  ← COMPLETE (smoke-tested 36/36 vs live DB; client built)
- [x] Product catalog (DIN, schedule, controlled flag, interaction classes) + inventory model (per-location item, lots with expiry).
- [x] Prescription workflow: entry with drug snapshot, prescriber records, dispensing record, refill tracking + status. **Client: Prescribers directory page** (list + add).
- [x] Drug-interaction engine vs. active meds; duplicate-therapy, allergy, and Beers Criteria alerts (runtime-verified).
- [x] Interaction alerts block Rx save until pharmacist acknowledges (409 flow).
- [x] Inventory: FEFO stock decrement, receiving, expiry alerts (30/60/90 buckets), low-stock detection, auto-generated draft POs.
- [x] POS/sales: OTC + Rx lines, province HST/GST (Rx zero-rated), stock decrement, daily cash-reconciliation summary.
- [x] Client pages: Inventory (stock + expiry), Prescriptions (list + dispense), and **Point of Sale** (catalog search → cart, per-line OTC/Rx type + editable qty/price, live province tax with Rx zero-rated, payment method, authoritative receipt + print, and a daily cash-reconciliation tab with expected-vs-counted variance).
- [~] OCR pipeline: pluggable provider interface + working stub; real engine (Vision/Textract) needs cloud creds.
- [x] Inter-pharmacy stock transfers (owner-approved) — request → owner approval → atomic FEFO stock move (decrement source, receive into destination); controlled substances post TRANSFER/RECEIPT to both locations' narcotics registers. New `StockTransfer` model + migration; new `GET /pharmacies` location directory (any authenticated user). **Client: Transfers page** (request form with product search + approval/cancel queue). Verified end-to-end (API: 50 units moved 198→148 / 0→50; UI in-browser).
- [ ] Digital/printed receipts; provincial + private insurance adjudication.
- [ ] Background job queue (Bull + Redis) for OCR and report generation (needs Redis).

Legend: [x] done · [~] partial · [ ] not started

## PHASE 3 — Compliance & Narcotics (Months 7–8)  ← COMPLETE (smoke-tested 25/25 vs live DB; client built)
- [x] Auto-generated daily/weekly/monthly/annual compliance checklist per pharmacy (idempotent generation, signature-required tasks).
- [x] Narcotics register with running balance; controlled-substance dispensing auto-posts to it; separate audit trail via AuditLog.
- [x] Compliance alerts & escalation: overdue-task sweep; narcotic count discrepancy raises CRITICAL alert and LOCKS the product (423) until resolved.
- [x] Health Canada recall ingest → auto-match to inventory by DIN → quarantine records + CRITICAL alerts per affected location.
- [x] License + pharmacy-permit expiry warnings (30/60/90 buckets); monthly compliance score with Green/Yellow/Red band.
- [x] Immutable audit-log viewer (owner: all locations + filter; partner: own location only).
- [x] Client pages: Compliance (checklist/alerts/score/licenses), Audit Log, **Narcotics register** (controlled-substance search, running-balance ledger, record txn/count, discrepancy resolve/unlock), and **Recalls** (recall list + ingest, quarantine clear/destroy workflow).
- [~] Recall feed is manual ingest; real MedEffect RSS/API poll (scheduled job) still to wire.
- [x] **Fine-grained "overdue 2h after due-time" escalation.** New `dueAt` timestamp column on
  `ComplianceRecord` (migration `compliance_due_at`, with a data backfill for existing rows),
  derived per-slot at generation time (single-occurrence tasks 18:00; two-a-day: morning
  10:00 / closing 20:00). Escalation now fires 2 hours past the exact due time instead of the
  end-of-day boundary (falls back to the old day-boundary rule for any pre-migration record
  that predates `dueAt`). Verified live: generated today's checklist, ran the escalation sweep,
  confirmed only tasks whose due time had passed by 2+ hours flipped to OVERDUE while others
  stayed PENDING.

Legend: [x] done · [~] partial · [ ] not started

## PHASE 4 — Financials (Months 9–10)  ← COMPLETE (smoke-tested 23/23 vs live DB; client built)
- [x] Full expense module: all 11 categories, sub-types, vendor, attachments, approval workflow (SUBMITTED→APPROVED/REJECTED→PAID; no self-approval), renewal alerts.
- [x] P&L per location + consolidated (owner); partner profit distribution by configurable ownership basis points.
- [x] CRA-oriented HST/GST summary (tax collected, input tax credits, net remittance).
- [x] CSV export (audited as EXPORT); client Finance page with P&L tiles + expense approval.
- [x] **AP (accounts-payable) aging report** — approved-but-unpaid expenses bucketed current/1–30/31–60/61–90/90+ days overdue (`GET /finance/ap-aging`; Finance page panel). Verified live.
- [x] **Budget variance report** — monthly budget-vs-actual by expense category (`PUT/GET
  /finance/budgets`, `GET /finance/budget-variance`; reuses the existing `Budget` model, no
  migration needed). **Cash-flow forecast** — monthly net cash flow (revenue minus paid-out
  expenses) history + 3-month projection via the same moving-average + linear-trend method as
  the Phase-10 sales forecast (`GET /finance/cash-flow-forecast`). Finance page gained both
  panels plus a budget-setting form. Verified live (budget set → variance computed correctly
  against real expense data, including a UTC month-bucketing fix for negative-offset server
  timezones).
- [x] **PDF export** — `GET /finance/expenses?format=pdf` (itemized expense report) and
  `GET /finance/pl?format=pdf` (one-page P&L statement with expense-by-category breakdown),
  using `pdfkit` (a mature, established library — not hand-rolled, since a subtly-wrong PDF
  byte-stream implementation risks producing a corrupt file with no easy way to notice).
  Finance page gained "Export expenses PDF" and "Download P&L PDF" buttons alongside the
  existing CSV export. Verified beyond structural validity (`%PDF-` header, `%%EOF` trailer)
  by extracting the actual text back out with a PDF parser and confirming the report content
  is correct (line-item amounts reconcile with the printed total).
- [ ] QuickBooks / Sage export formats; payroll remittance detail — these need the exact
  target format spec (QBO/IIF layout, Sage's column schema) to build correctly; flagging
  rather than guessing.

## PHASE 5 — Camera & Comms (Months 11–12)  ← COMPLETE (smoke-tested 23/23 vs live DB; client built)
- [x] Camera registration + management (placement, IP, brand); health-check heartbeat + status; footage-view audit logging.
- [x] Camera page with status grid (role-scoped: owner all, partner own).
- [x] Internal messaging (intra-location) + owner broadcast (no cross-location leakage for partners). **Client: Messages page** — inbox with scope badges (Broadcast/Location), owner broadcast composer (all locations or one), and an auto-scoped intra-location composer for staff.
- [x] Refill reminders (CASL opt-in) generated + dispatched via pluggable provider (Twilio/SendGrid stub). **Client: Notifications page** — queue with status badges, generate refill reminders, dispatch pending.
- [ ] Real WebRTC/HLS live streaming + 16-grid thumbnails; motion-event push; automated scheduled report delivery.

## PHASE 12 — HR scheduling (new build, spec §11 follow-on)  ← IN PROGRESS
- [x] `Shift` model + migration (`hr_scheduling`): assignee, location, start/end, role/station,
  notes, status (SCHEDULED/PUBLISHED/CANCELLED), created-by. Back-relations on `User`/`Pharmacy`.
- [x] `SHIFT_READ`/`SHIFT_WRITE` permissions wired into the role matrix (every role reads the
  schedule; owner/partner/PIC can write) — no `seed.ts` changes needed, picked up generically.
- [x] `server/src/modules/scheduling`: list/create/update/publish/cancel endpoints, location-scoped,
  Zod-validated, audit-logged. Self-service `GET /scheduling/shifts/me` open to any authenticated
  user (mirrors the attendance `/me` pattern).
- [x] Client: **Scheduling page** — "my upcoming shifts", a create-shift form (staff picker +
  datetime range + optional role/notes), and a 14-day team schedule table with publish/cancel.
  Nav link + route registered; verified in-browser (Playwright) with zero console errors.
- [x] **Incident reports**: `IncidentReport` model + migration (`hr_incident_reports`) — category,
  severity, status (OPEN/UNDER_REVIEW/RESOLVED/CLOSED), reporter + resolver. `INCIDENT_READ`/
  `INCIDENT_MANAGE` permissions (owner/partner/PIC triage; every role can self-file). New
  `server/src/modules/incidents` (self-service file/list-mine open to any authenticated user;
  location-scoped list/update/resolve/close for managers, audit-logged). **Client: Incident
  Reports page** — report form, "my reports", and a manager triage table with resolve/close.
  Verified via live API (file→list→resolve→close) and in-browser (Playwright: nav link, form
  submit, table updates, zero console errors).
- [x] **Training/CE tracking**: `TrainingRecord` model + migration (`hr_training_records`) —
  title/provider/category, credit hours, completed/expiry dates. `TRAINING_READ`/`TRAINING_MANAGE`
  permissions (owner/partner/PIC view team + expiring-soon; every role can self-log). New
  `server/src/modules/training` (self-service log/list-mine open to any authenticated user;
  managers can log on behalf of a team member, view the location-wide list, and an
  expiring-credential report bucketed 30/60/90 days, mirroring the Phase-3 license-expiry
  pattern). **Client: Training & CE page** — log-record form (self or on-behalf-of), an
  expiring-soon panel, "my training history", and a team records table. Verified via live API
  (log→mine→team-list→expiring, plus an RBAC guard on logging for an invalid target user) and
  in-browser (Playwright: nav link, form submit, table + expiring panel populate, zero console
  errors from the app's own code).
- [x] **Performance reviews**: `PerformanceReview` model + migration (`hr_performance_reviews`) —
  period, rating, strengths/areas-for-improvement/goals/comments, status (DRAFT/SUBMITTED/
  ACKNOWLEDGED). `REVIEW_READ`/`REVIEW_MANAGE` permissions (owner/partner/PIC draft, submit,
  and view team reviews); the reviewed employee self-service acknowledges (mirrors the Phase-8
  e-signature request/sign pattern) — drafts are withheld from the employee's own view until
  submitted. New `server/src/modules/reviews` (create/list-mine/list-team/update/submit/
  acknowledge, location-scoped, audit-logged). **Client: Performance Reviews page** — draft
  form (managers), "my reviews" with an acknowledge action, and a team reviews table with
  submit. Verified via live API (draft→hidden-from-employee→submit→employee sees it→
  acknowledge→edit-after-acknowledge blocked, plus an RBAC 403 check for a non-manager role)
  and in-browser (Playwright/screenshot: nav link, form, team table renders correctly).
  **This completes the spec §11 HR module** (attendance, scheduling, incident reports,
  training/CE, performance reviews all shipped).

## PHASE 6 — QA & Hardening (Months 13–15)  ← IN PROGRESS
- [x] Automated unit suite (vitest): RBAC guards, JWT, MFA, drug-interaction engine, tax, CSV, barcode — 35 tests passing (`npm test`, DB-independent).
- [x] **HTTP-level integration suite (supertest vs live DB, RLS active) — 35 tests passing (`npm run test:integration`):** auth flow (login/refresh-rotation/logout/`/me`, bad-cred + tampered-token 401s), DB-backed RBAC (owner-only endpoints 403 for partner / 200 for owner), location-scoping + RLS isolation (partner cannot list/read/write another location's patients; other-location rows are RLS-invisible → 404), and a core clinical workflow (patient → allergy/condition → dashboard/inventory reads → audit-trail assertion). Sequential single-fork config; self-cleaning test data via superuser `DIRECT_URL`.
- [x] System health/monitoring endpoint (DB check, counts, uptime); public liveness probe.
- [x] **Load test — 200 concurrent users (spec target) — DONE.** autocannon harness (`npm run loadtest`) boots the app in-process (rate limiting off, logging off), pre-authenticates owner+partner, then drives 200 concurrent connections across a real dashboard/patients/inventory read mix. Enforces a pass/fail gate (p99 < 3s per spec §4.3, zero non-2xx/errors/timeouts). Local baseline: 200 conns, ~215 req/s, p99 ~1.9s, 0 errors. Rate limits are now env-configurable (`RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`; 0 disables) — production tuning + load-test enablement.
- [ ] Penetration testing / security review.
- [ ] UAT with pharmacists; training; phased rollout; DR drills.

## PHASE 7 — Platform features (from expanded brief)  ← COMPLETE (backend + client verified)
- [x] Feature flags (global + per-pharmacy override) — enable modules per location without redeploy.
- [x] Global search across patients, prescriptions, and products (permission- + location-scoped).
- [x] Audit explorer (Phase 3 viewer) + system administration console (client).

## PHASE 8 — Documents, e-signature, bulk import  ← COMPLETE (backend smoke-tested; client built + browser-verified)
- [x] Document manager: upload (base64) via pluggable storage abstraction (S3-ready stub), list, category, audit-logged.
- [x] E-signature: request → sign/decline with captured signature data (DocuSign/Adobe-ready).
- [x] Bulk data import wizard (CSV) for products + patients with per-row validation + error report.

## PHASE 9 — Platform config & operations  ← COMPLETE (backend smoke-tested; client built + browser-verified)
- [x] Typed system settings (cached) — currency, timezone, locale, data-retention (>=10y enforced).
- [x] Maintenance mode: settings-driven read-only lockdown middleware (auth/settings paths stay open).
- [x] Per-user notification preferences (SMS/email/push/in-app).

## PHASE 10 — Reporting & analytics  ← COMPLETE (backend smoke-tested; client built + browser-verified)
- [x] Report engine: sales-by-day, expenses-by-category, Rx volume; saved/custom reports.
- [x] Sales forecast (moving-average + linear trend), dependency-free.

## PHASE 11 — Workflow engine, admin tooling  ← COMPLETE (backend smoke-tested; client built + browser-verified)
- [x] Generic approval workflow engine (any entity/action; no self-approval).
- [x] Role simulator (effective permissions per role, owner-only).
- [x] Activity timeline (per-entity, from immutable audit log).
- [x] Code39 barcode SVG generator (labels) — dependency-free, tested.
- [x] **QR code SVG generator** — `GET /admin/qrcode`, `Admin` page format toggle
  (Code39/QR) alongside the existing barcode tool. Uses the small, dependency-free
  `qrcode-generator` library (renders our own SVG from its module matrix) rather than
  hand-rolling QR's Reed-Solomon error correction, which isn't safe to implement without a
  way to verify the output actually scans. Verified structurally (valid module count, all
  three finder patterns byte-for-byte correct per spec) plus a live API smoke test; 3 new
  unit tests.

- [x] **Global search client UI + keyboard shortcut.** The `GET /search` API (Phase 7,
  `search:global`) had shipped with zero client UI. Added a `GlobalSearch` command palette
  (`client/src/components/GlobalSearch.tsx`) opened via Ctrl/Cmd+K or a "Search" sidebar
  button, debounced query, grouped results (patients/prescriptions/products); since no
  entity has a per-record detail page anywhere in this app, a result navigates to the
  relevant list page, matching existing navigation. Verified in-browser (Playwright): nav
  button, Ctrl+K, Escape, click-outside, and result-click-navigates all confirmed, zero
  console errors for a location-scoped user.

- [x] **Custom fields (Patients + Products).** `CustomFieldDefinition` model + migration
  (`custom_fields`, also adds `Patient.customFields Json`) — admin-defined extra fields
  (TEXT/NUMBER/DATE/BOOLEAN/SELECT), owner-managed via a new Admin console panel, rendered
  dynamically via a generic `CustomFieldsEditor` component driven entirely by server
  metadata. Started with Patients only, since Products had no client edit UI at all to
  attach fields to at the time. Values are validated server-side against active definitions
  on every write (unknown keys rejected, types coerced/checked, SELECT options enforced);
  `required` is a UI hint only, not retroactively enforced against existing records. **This
  also surfaced and fixed a bigger pre-existing gap: the Patients page had no working
  create/edit form at all** (the "+ New patient" button was a permanently-disabled stub) —
  built a real create/edit flow since the custom-fields feature needed a genuine place to
  live. Verified via live API (valid/invalid SELECT value, unknown-key rejection,
  partial-merge update preserving other fields, deactivate-then-reject-write, non-owner 403
  on definition management) and in-browser via Playwright (both the patient form and the
  Admin definitions panel, zero console errors, full create→edit round-trip with the custom
  value correctly pre-filled).
- [x] **Products management UI + Product custom fields (follow-on).** Products previously had
  *zero* client UI — creatable only via seed/API — which was also the exact blocker
  documented above for Product custom fields. Built a **Product Catalog** page (list +
  search + create/edit, mirroring the Patients pattern) reusing the existing
  `GET/POST/PATCH /products` endpoints, then extended `CustomFieldEntityType` with `PRODUCT`
  (migration `product_custom_fields`, adds `Product.customFields Json`) and wired the same
  `CustomFieldsEditor` into the product form. The Admin "Custom fields" panel gained an
  entity-type selector (Patients/Products) instead of being Patient-only. Verified live API
  (create/update with custom values, unknown-key rejection, partial-merge, non-`product:manage`
  role 403) and in-browser via Playwright (nav link, list, edit pre-fills the custom value,
  create round-trips a new product with a custom field, zero console errors beyond the
  expected pre-login settings fetch). 73/73 tests still pass.

- [x] **i18n — English + French.** A best-guess scope, since this backlog item had no spec:
  justified by two things already in the codebase, not an arbitrary language list —
  `Patient.preferredLanguage` exists in the schema, and the seed data includes Quebec
  locations (regulatory body OPQ), where French is a *legal* requirement for customer-facing
  software (Charter of the French Language / Bill 96), not a nice-to-have. Built a small,
  dependency-free `client/src/lib/i18n` (context + hook + flat dictionaries) — no library,
  since a plain key→string lookup has no "silently wrong" failure mode the way QR/PDF
  generation would. **Coverage is deliberately partial, not full-app**: the persistent chrome
  (sidebar nav, user box, role labels) plus Login and Settings are fully translated as a
  complete, verifiable slice and a working demonstration of the pattern — most of the other
  ~25 pages remain English-only. Locale resolves as personal override (localStorage,
  mirroring the dark-mode pattern) > system-wide default (`SystemSettings.defaultLocale`) >
  English. Language switcher in the sidebar, Login page, and a dedicated Settings section.
  **Caveat:** the French strings are a good-faith AI translation, not reviewed by a native
  speaker — flag that before a real Quebec rollout. Verified in-browser (Playwright): full
  EN→FR switch on Login, persists across reload and navigation, Settings page and nav fully
  translated, switching back to EN leaves no French leftovers, zero console errors beyond the
  expected pre-login 401 from the best-effort system-default fetch.

- [x] **i18n coverage extended**: Owner Dashboard, Location Dashboard, Patients, and Products
  are now fully translated (headings, stat labels, table columns, forms, notices), on top of
  the chrome/Login/Settings slice from the first i18n pass. Added lightweight `{{var}}`
  interpolation to `t()` (e.g. `t('pageOf', { page, totalPages })`,
  `t('tasksCompleteCount', { completed, total })`) rather than fragmenting sentences into
  disconnected word-by-word keys, which reads badly once French word order differs from
  English. Verified in-browser via Playwright across all four pages, including the
  interpolated strings rendering correctly ("2/14 tâches terminées"). 73/73 tests still pass.
- [x] **i18n coverage, round 3**: Inventory, Prescriptions, and Compliance also fully
  translated. Compliance included the native `window.prompt()` text for signature capture,
  easy to miss since it's not JSX. Verified in-browser (triple interpolation in Inventory's
  subtitle line rendered correctly: "3 produit(s) · 0 sous le seuil de réapprovisionnement ·
  0 alerte(s) d’expiration"). 73/73 tests still pass.
- [x] **i18n coverage, round 4**: Prescribers, Recalls, and Narcotics also fully translated —
  Narcotics in particular is the page most directly tied to the Quebec-compliance
  justification for building i18n at all (controlled-substance register, CDSA/NAPRA
  discrepancy workflow). Multiple dynamic notice strings with 1-3 interpolated values each
  (e.g. `t('discrepancyNotice', { value, name })`, `t('countBalancedNotice', { name, qty })`).
  Verified in-browser across all three pages. 73/73 tests still pass.
- [x] **i18n coverage, round 5**: Transfers and Finance also fully translated. Finance moved
  a module-scope `AP_BUCKETS` label array into a `labelKey`-driven list so it could resolve
  through `t()` (it previously held hardcoded English strings outside the component, where
  no `t()` is in scope). Verified in-browser, including two interpolated headings
  ("Écart budgétaire — 2026-07", AP-aging's "{{count}} unpaid · {{amount}} owed"). 73/73
  tests still pass.
- [x] **i18n coverage, round 6**: Messages and Point of Sale also fully translated, including
  the POS physical receipt (both the on-screen summary and the separate print-window HTML).
  A Playwright verification pass caught two real bugs pre-ship: hardcoded English
  `placeholder` attributes on the Messages composers (easy to miss since `t()` was already
  wrapping the visible labels around them), and the Sales "Clear cart" button silently reusing
  the Recalls page's "lift quarantine" key (`clearButton` → "Lever"), a wrong-context bug
  invisible in English since both happened to read "Clear". Both given dedicated keys and
  re-verified in French. 73/73 tests still pass.
- [x] **i18n coverage, round 7**: Audit Log and Notifications also fully translated —
  interpolated event-count subtitle and pager on Audit Log, 4 stat tiles + generate/dispatch
  notices with interpolated counts on Notifications. Verified in-browser via Playwright
  (pager advances correctly across pages, generate-reminders notice interpolates a real count
  with no literal `{{count}}`). 73/73 tests still pass.
- [x] **i18n coverage, round 8 — COMPLETE.** The remaining 11 pages (Cameras, Workflow,
  Attendance, Reports, Staff, Scheduling, Incidents, Reviews, Training, Documents, Admin) all
  fully translated in one pass. Admin (the largest page — health stats, feature flags, role
  simulator, activity timeline, barcode/QR tool, backups, custom fields) got the same
  treatment across every sub-section. Raw backend enum badges (status/category/type values)
  intentionally stay untranslated, matching the convention already established on earlier
  pages. Three parallel Playwright verification passes caught and fixed one real bug: the
  Workflow page's empty-state message was interpolating a raw English status word into an
  otherwise-French sentence ("Aucune demande pending.") — fixed with dedicated translated
  status-word keys and re-verified. **No pages remain English-only; the i18n backlog item is
  fully closed.** 73/73 tests still pass.

### Still roadmapped (not built)
- Client UI surfaces for Phases 8–11 (backend + APIs are done; pages pending).
- Real S3/OCR/Twilio/SendGrid/DocuSign providers (interfaces + stubs in place).
- Bull/Redis job queue; WebRTC/HLS streaming; theme manager.
- i18n coverage is now **complete** — every page in the app is fully bilingual
  (English/French). No pages remain English-only.

- [x] **On-demand DB backups (Admin console).** `POST/GET /admin/backups` (create/list),
  `GET /admin/backups/:filename/download`, using `pg_dump` via `execFile` with a fixed argv
  array (no shell string, so no command-injection surface) against the superuser `DIRECT_URL`
  — dumping via the app's own least-privilege `pharmacy_app` role would silently produce an
  RLS-filtered backup missing every patient-table row, since pg_dump never sets our
  `app.is_owner`/`app.pharmacy_id` GUCs. Filenames are server-generated only; the download
  route rejects anything not matching that exact pattern (path-traversal guard). **Deliberately
  no restore endpoint** — overwriting the live database is destructive enough that it
  shouldn't be a one-click API action; see STATUS.md for the manual `pg_restore` procedure.
  Verified live: created a real backup, confirmed via `pg_restore --list` that it's a valid
  409-entry archive including `Patient` table data (proving the RLS-bypass actually worked),
  confirmed the download endpoint serves the right bytes, confirmed a path-traversal attempt
  and a non-owner request both get rejected. Caught and fixed a real bug in the process: raw
  `pg_dump` rejects Prisma's `?schema=` connection-string query param outright.

---

## PHASE 13 — Spec-compliance gaps (identified 2026-07-20 code audit vs `Pharmacy_Management_System_Requirements2.docx`)
Items below were verified missing directly in code (not just self-reported) — real dev work,
distinct from the already-known "needs external credentials" stubs (OCR/S3/Twilio/SendGrid/
DocuSign — interfaces exist, only creds are missing) and from pure process items (pen test,
UAT, DR drills, legal/regulatory sign-offs).

### Sales / POS (spec §7)
- [x] **Refund & return workflow — DONE.** New `Refund`/`RefundLine` models; amounts at/below
  `settings.refundApprovalThresholdCents` ($50 default) complete immediately (incl. OTC stock
  reversal via a new `restockReturn` inventory helper); above it, held `PENDING_APPROVAL` until
  a different user with `refund:approve` decides (no self-approval) — REJECTED never touches
  stock. Controlled substances are deliberately never auto-restocked. New `/refunds` module +
  `GET /sales/:id` (needed so a cashier can look up an older receipt). **Client:** a Refunds tab
  on the POS page (sale lookup, per-line refund panel, approval queue) plus a "Start a refund"
  button on the post-sale receipt. Verified live end-to-end (auto-complete, pending→approve
  with real stock increment, self-approval 403, reject leaves stock untouched, over-quantity
  guard) + 4 new integration tests.
- [x] **Daily sales summary + scheduler — DONE.** New dependency-free `services/scheduler.ts`
  (drift-corrected daily/interval timers, only ever started from `index.ts` — never during
  tests). `jobs/dailySalesSummary.ts` runs at 11:00 UTC, emails every location's partner(s) +
  the owner via the existing notification pipeline (extended `dispatchPendingForPharmacy` to
  also resolve staff `recipientUserId` contacts, not just patients). Manual trigger + Admin
  panel for testing. Verified live (16 pharmacies processed, notifications queued and SENT).

### Security / Auth (spec §13.1)
- [x] **Session inactivity timeout — DONE.** New `SESSION_INACTIVITY_TIMEOUT` env var (default
  900s) enforced independently of the JWT's own fixed expiry, in both `authenticate` middleware
  *and* `/auth/refresh` — the latter matters because with equal TTLs an idle user's access token
  would simply expire first and silently refresh, never tripping the check. Found and fixed a
  real bug during verification: a fresh login didn't reset the activity clock, so a user
  idle-timed-out from a prior session got immediately re-kicked on their very next request.
  `User.lastActivityAt` (throttled write, 60s) added via migration.
- [x] **Role-based IP whitelisting — DONE.** `Pharmacy.allowedIpRanges` (comma-separated
  IPv4/CIDR or IPv6 literals), dependency-free `utils/ip.ts` matcher, enforced at login for
  location-scoped roles (owner unrestricted). `PATCH /pharmacies/:id/ip-allowlist` (owner-only)
  + an Admin console panel. Verified live: partner blocked when restricted, owner unaffected,
  restriction lifts cleanly. 6 new unit tests.
- [x] **SIN field + encryption — DONE.** `User.sinEnc` (AES-256-GCM, same pattern as patient
  health-card/insurance), payroll/HR use only. Never in the staff list; only the new
  `GET /users/:id` detail endpoint (`user:manage`) decrypts it. Staff page gained an inline
  "manage SIN" editor. Verified round-trip live.

### Patients / Compliance (spec §10, §12)
- [x] **Recall broadcast to PICs + 15-min SLA — DONE.** `ingestRecall` now dispatches an EMAIL
  notification to every PIC at each affected location immediately (not just a passive alert).
  New `runRecallNotificationEscalation` sweep (every 5 min) retries delivery once and raises a
  CRITICAL `RECALL_NOTIFICATION_SLA_BREACH` alert for anything still undelivered past 15
  minutes. Verified live (real dispatch + a simulated stuck-notification escalation) + 2 new
  integration tests.
- [x] **Real MedEffect recall polling job — DONE, genuinely real (not a stub).** Health Canada
  actually publishes recalls as a public, no-auth-required JSON dataset updated daily
  (`open.canada.ca` dataset `d38de914-...`) — unlike OCR/S3/Twilio/DocuSign, this needed no
  credentials to build for real. New `services/recallFeed.ts` (pluggable, still swappable) +
  `jobs/recallPoll.ts` (2h interval, cursor-tracked via `SystemSetting`, manual trigger +
  Recalls-page "Poll now" button). Caught a real parsing bug pre-ship: the feed's "Type I" class
  string is textually a substring of "Type II", so naive `.includes()` misclassified every
  Type II/III recall as Type I — fixed with exact segment matching, 5 new unit tests. Verified
  against the live feed: fetched 1,078 real drug/health-product recalls, cursor correctly
  returned 0 on immediate re-poll. **Known limitation, documented in code:** the feed has no DIN
  field, only free-text product names — auto-quarantine matching (which is intentionally
  DIN-exact, not fuzzy, for patient-safety reasons) won't fire from feed-sourced recalls; a real
  DIN cross-reference would need the separate Health Canada Drug Product Database.

### Camera (spec §9)
- [x] **Camera video rendering — DONE (HLS; RTSP still needs an external relay, documented).**
  New `CameraPlayer` component: native playback on Safari, `hls.js` (dynamically imported —
  keeps it out of the main bundle for every other page) elsewhere. RTSP shows a clear
  explanatory message rather than failing silently, since no browser can play it without a
  server-side relay this app doesn't run. Verified the full data path live against a real
  public HLS test stream (Apple's bipbop test asset) end-to-end; **could not visually confirm
  in-browser rendering** — no browser-automation tool was available in this session, so treat
  the player itself as code-reviewed and data-path-verified but not yet eyeballed running.

### Finance / HR (spec §8, §11, §14)
- [x] **CPP/EI remittance due-date tracking + alerting — DONE.** New `services/craRemittance.ts`
  (verified against the actual CRA rule, not guessed): regular remitters due the 15th of the
  following month, quarterly remitters due the 15th after quarter-end — threshold-1/2 remitters
  need per-pay-period tracking this app doesn't model, so they're explicitly out of scope rather
  than approximated. PAYROLL expenses auto-get a computed `dueDate` unless one's set explicitly.
  Daily escalation sweep raises WARNING within 5 days, escalates the *same* alert to CRITICAL
  once overdue (verified it doesn't duplicate). New `craRemitterType` system setting (owner
  configurable). Caught and fixed a real UTC-drift bug during verification — the exact class of
  bug `finance.service.ts`'s `monthStart` had already been fixed for once before, and I
  reintroduced a fresh instance of it. Finance page gained a remittances panel. 2 unit + 4
  integration tests.
- [x] **QuickBooks/Sage export — DONE, against real documented formats (not guessed).**
  New `services/accountingExport.ts`: QuickBooks IIF (TRNS/SPL/ENDTRNS, tab-delimited, verified
  splits always sum to zero) and Sage 50/Sage Business Cloud Accounting CSV (`Reference,Date,
  Description,Ledger Account Number,...,Debit,Credit,...`, verified against Sage's own KB
  example). **Necessarily-deployment-specific caveat, called out in code and the UI:** which GL
  account each expense category posts to can't be known generically — placeholder account
  numbers/names are used, and a bookkeeper must remap them to the real chart of accounts before
  relying on this for actual filing (true of any accounting export, not a shortcut taken here).
  Finance page gained both export buttons. 8 unit tests (zero-sum invariant, exact header
  strings, CSV escaping, date formats).
- [x] **Payment-gateway adapter — DONE.** New `services/paymentGateway.ts` (pluggable, stub
  approves everything) wired into `sales.service.ts`: DEBIT/CREDIT sales charge before the DB
  transaction opens (a decline must stop the sale from being created, and an external call has
  no business holding a transaction open); a decline throws before anything is written.
  Refunds reverse the charge the same way, on both the immediate-complete and
  manager-approved paths. New `Sale.paymentTransactionId`/`Refund.paymentTransactionId`
  columns. Receipt shows the gateway transaction id when present. 3 unit tests + live
  end-to-end verification (charge → refund → reversal, cash sales correctly skip the gateway
  entirely).
- [x] **Insurance adjudication interface — DONE.** New `services/insuranceAdjudication.ts`
  (pluggable, stub approves in full). Only the Rx-line portion of a sale is claimable — OTC/
  compound/service lines are never drug-plan-covered and stay patient-pay regardless; a claim
  rejection blocks the sale the same way a card decline does. Refunds reverse the whole claim
  (real payers reverse at the claim level, not a partial dollar amount). New
  `Sale.insuranceClaimId`/`insuranceCoveredCents` columns. Receipt shows "insurance covered /
  patient owes" when present. 3 unit tests + live end-to-end verification (RX-only coverage
  split, patientId-required guard, refund→claim-reversal).

### Infrastructure-adjacent (spec §16 Scalability)
- [x] **Job queue abstraction — DONE.** New `services/queue.ts`: in-process by default (zero
  infra, `setImmediate`-based), transparently swaps to a real Bull queue the moment `REDIS_URL`
  is set — same call sites, no code change at the swap point. Deliberately NOT wired onto OCR or
  report generation: both are synchronous request/response endpoints today (a pharmacist
  waits for the OCR pre-fill; a report caller waits for the JSON), and queuing them would mean
  inventing a job-status-polling API — a UX regression, not an architecture win. Instead wired
  onto what's genuinely a background job today: all four scheduled jobs (daily sales summary,
  recall-notification SLA sweep, recall-feed poll, CRA-remittance escalation) now enqueue rather
  than run inline from the timer — the real trigger/execution split a job queue exists for.
  `bull` added as a real dependency (its own bundled TS types, no `@types/bull` needed). 4 unit
  tests + a clean server boot with zero warnings.
- [x] **Automated/scheduled backup job — DONE.** New `pruneOldBackups(retentionDays)` in
  `services/backup.ts` + `jobs/automatedBackup.ts`, scheduled daily at 09:00 UTC through the
  queue above. New `BACKUP_RETENTION_DAYS` env var (default 30). Deliberately doesn't attempt
  point-in-time recovery or the "geographically separate" half of spec §13.2 — those are
  hosting/infra decisions (where `BACKUP_DIR` actually points), not app code. 3 unit tests
  (retention-window boundary, nothing-to-prune, never touches a non-matching filename) using a
  real temp directory + `fs.utimes` — no pg_dump needed to test the pruning logic itself.

### Testing (spec §16)
- [x] **Coverage tooling + 80%+ on all three named modules — DONE, measured for real.** New
  `vitest.coverage.config.ts` (`npm run test:coverage`) runs unit + integration together — unit
  tests alone barely touch the service files, since most of their branches only execute via a
  live DB. Baseline (before this pass): prescriptions.service.ts 1.27%, finance.service.ts
  8.68%, compliance.service.ts 18.71%. Three new integration test files later:
  **prescriptions.service.ts 98.68%, finance.service.ts 99.03% (expenses.service.ts 98.8%),
  compliance.service.ts 97.32%** — all comfortably past the spec's 80% bar. Also found and
  deleted one genuinely dead function (`assertDispensePermission`, never called anywhere,
  redundant with the route's own `requirePermission` gate) rather than writing a pointless test
  for it. Overall project coverage moved 53.39% → 65.71% as a side effect; other modules weren't
  individually chased since the spec names only these three.

### Offline mode (spec §13.2) — largest single gap
- [x] **Offline dispensing cache + sync-on-reconnect — DONE, verified end-to-end against a real
  server.** Three parts: (1) a service worker (`public/sw.js`, stale-while-revalidate for
  same-origin static assets, production-only — never registered in dev, where it would fight
  Vite's HMR) so the app shell itself still loads with zero connectivity; (2) a dependency-free
  IndexedDB wrapper (`lib/offline/db.ts`) holding a cached prescription-list snapshot and a
  queue of pending dispenses; (3) `lib/offline/offlineDispense.ts` + a `useOnlineStatus` hook —
  a dispense attempted while offline is queued locally with a client-generated idempotency key
  and optimistically applied to the cached list immediately, then replayed against the real API
  the moment the `online` event fires. **Conflict/safety handling:** the server (new
  `DispensingRecord.offlineSyncKey`, unique) returns the original result instead of
  double-dispensing if a sync is retried after a response was lost; a job that fails for a real
  reason (e.g. stock insufficient by the time it synced) stays queued with the error attached
  rather than being silently dropped, so a human can resolve it. Prescriptions page now shows an
  offline banner, a "using cached data" notice, a queued-count notice, and a per-row "queued"
  badge. Verified two ways: a live integration test proving the idempotent-replay behavior
  itself (dispense twice with the same key → stock decrements once, not twice, second response
  flagged `replayed: true`), and — since this app has no client test framework at all — a
  temporary Node script (`fake-indexeddb` + `tsx`, both `--no-save`, deleted after, matching the
  existing PDF-verification precedent of not adding a dependency just to check something once)
  that ran the *actual* client offline module against the real running server end-to-end: queue
  while "offline" → confirmed the real server was untouched → sync → confirmed a genuine
  `DispensingRecord` was created server-side, not just a local state change. **Could not verify
  the UI itself in a real browser** (no browser-automation tool available this session) — same
  caveat as the camera player; the module's logic is real-server-verified, the on-screen
  rendering is not yet eyeballed.

Legend: [x] done · [~] partial · [ ] not started

**PHASE 13 status: all 16 items now [x] done.** Every coding-only gap identified in the
2026-07-20 audit against the client's requirements doc is closed. What's left for
production-readiness is exactly the "needs configuration/credentials" list already tracked
elsewhere in this document (external provider credentials, hosting/infra, pen test, UAT,
compliance/legal sign-offs) — see the Phase 6 "Still roadmapped" notes and the integrations
checklist above.

---

## Cross-cutting (throughout)
- Canadian data residency; TLS 1.3; AES-256 at rest; field-level PII encryption.
- Append-only audit trail on every sensitive action; 10-year retention.
- Feature-flag system (enable modules per location without redeploy).
- API-first; single frontend codebase; mobile-responsive.

## Compliance sign-off gates (before production)
- Canadian pharmacy regulatory consultant review of compliance module.
- Privacy lawyer review for PIPEDA + provincial acts.
- Pharmacist UAT sign-off.
