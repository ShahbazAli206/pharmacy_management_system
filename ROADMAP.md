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

## PHASE 1 — Foundation (spec Months 1–3)  ← IN PROGRESS

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
- [ ] Run initial migration against a live PostgreSQL DB (needs DB connection).

### 1.3 Authentication
- [x] Login with hashed passwords (bcryptjs, 12 rounds).
- [x] JWT issuance with `role` + `locationId` claims; refresh-token rotation (hashed at rest).
- [x] Logout (refresh-token revocation).
- [x] 15-minute access-token TTL (inactivity timeout baseline).
- [~] MFA scaffolding: DB fields + otplib installed; verify flow not yet wired.
- [ ] Password reset flow (stub email).

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
- [ ] Allergy/condition write sub-resource endpoints.

### 1.6 Basic dashboards
- [x] Owner consolidated overview endpoint (real location/staff/patient counts; revenue/compliance stubbed for later phases).
- [x] Partner scoped dashboard endpoint (own location only).
- [x] React (Vite) client scaffold; login screen; role-based routing + protected routes.
- [x] Owner vs. partner dashboard views from a single codebase (JWT/permission-driven render).
- [x] API client with automatic refresh-token rotation on 401; patients list page.

### 1.7 Phase-1 hardening
- [ ] PostgreSQL row-level security policies for location isolation.
- [ ] Unit/integration tests for auth + RBAC + patient scoping.
- [ ] API documentation (OpenAPI/Swagger).

Legend: [x] done · [~] partial · [ ] not started

---

## PHASE 2 — Core Pharmacy (Months 4–6)  ← LARGELY COMPLETE
- [x] Product catalog (DIN, schedule, controlled flag, interaction classes) + inventory model (per-location item, lots with expiry).
- [x] Prescription workflow: entry with drug snapshot, prescriber records, dispensing record, refill tracking + status.
- [x] Drug-interaction engine vs. active meds; duplicate-therapy, allergy, and Beers Criteria alerts (runtime-verified).
- [x] Interaction alerts block Rx save until pharmacist acknowledges (409 flow).
- [x] Inventory: FEFO stock decrement, receiving, expiry alerts (30/60/90 buckets), low-stock detection, auto-generated draft POs.
- [x] POS/sales: OTC + Rx lines, province HST/GST (Rx zero-rated), stock decrement, daily cash-reconciliation summary.
- [x] Client pages: Inventory (stock + expiry) and Prescriptions (list + dispense).
- [~] OCR pipeline: pluggable provider interface + working stub; real engine (Vision/Textract) needs cloud creds.
- [ ] Inter-pharmacy stock transfers (owner-approved).
- [ ] Digital/printed receipts; provincial + private insurance adjudication.
- [ ] Background job queue (Bull + Redis) for OCR and report generation (needs Redis).

Legend: [x] done · [~] partial · [ ] not started

## PHASE 3 — Compliance & Narcotics (Months 7–8)  ← LARGELY COMPLETE
- [x] Auto-generated daily/weekly/monthly/annual compliance checklist per pharmacy (idempotent generation, signature-required tasks).
- [x] Narcotics register with running balance; controlled-substance dispensing auto-posts to it; separate audit trail via AuditLog.
- [x] Compliance alerts & escalation: overdue-task sweep; narcotic count discrepancy raises CRITICAL alert and LOCKS the product (423) until resolved.
- [x] Health Canada recall ingest → auto-match to inventory by DIN → quarantine records + CRITICAL alerts per affected location.
- [x] License + pharmacy-permit expiry warnings (30/60/90 buckets); monthly compliance score with Green/Yellow/Red band.
- [x] Immutable audit-log viewer (owner: all locations + filter; partner: own location only).
- [x] Client pages: Compliance (checklist/alerts/score/licenses) and Audit Log.
- [~] Recall feed is manual ingest; real MedEffect RSS/API poll (scheduled job) still to wire.
- [ ] Fine-grained "overdue 2h after due-time" escalation (needs per-slot due times; currently end-of-day).

Legend: [x] done · [~] partial · [ ] not started

## PHASE 4 — Financials (Months 9–10)  ← CORE COMPLETE
- [x] Full expense module: all 11 categories, sub-types, vendor, attachments, approval workflow (SUBMITTED→APPROVED/REJECTED→PAID; no self-approval), renewal alerts.
- [x] P&L per location + consolidated (owner); partner profit distribution by configurable ownership basis points.
- [x] CRA-oriented HST/GST summary (tax collected, input tax credits, net remittance).
- [x] CSV export (audited as EXPORT); client Finance page with P&L tiles + expense approval.
- [ ] Cash-flow forecast, AP aging, budget variance reports.
- [ ] PDF / QuickBooks / Sage export formats; payroll remittance detail.

## PHASE 5 — Camera & Comms (Months 11–12)  ← CORE COMPLETE
- [x] Camera registration + management (placement, IP, brand); health-check heartbeat + status; footage-view audit logging.
- [x] Camera page with status grid (role-scoped: owner all, partner own).
- [x] Internal messaging (intra-location) + owner broadcast (no cross-location leakage for partners).
- [x] Refill reminders (CASL opt-in) generated + dispatched via pluggable provider (Twilio/SendGrid stub).
- [ ] Real WebRTC/HLS live streaming + 16-grid thumbnails; motion-event push; automated scheduled report delivery.

## PHASE 6 — QA & Hardening (Months 13–15)  ← STARTED
- [x] Automated test suite (vitest): drug-interaction engine, tax, CSV — 12 tests passing.
- [x] System health/monitoring endpoint (DB check, counts, uptime); public liveness probe.
- [ ] Penetration testing; load test (200 concurrent users); broader integration coverage.
- [ ] UAT with pharmacists; training; phased rollout; DR drills.

## PHASE 7 — Platform features (from expanded brief)  ← COMPLETE (core)
- [x] Feature flags (global + per-pharmacy override) — enable modules per location without redeploy.
- [x] Global search across patients, prescriptions, and products (permission- + location-scoped).
- [x] Audit explorer (Phase 3 viewer) + system administration console (client).

## PHASE 8 — Documents, e-signature, bulk import  ← BACKEND COMPLETE
- [x] Document manager: upload (base64) via pluggable storage abstraction (S3-ready stub), list, category, audit-logged.
- [x] E-signature: request → sign/decline with captured signature data (DocuSign/Adobe-ready).
- [x] Bulk data import wizard (CSV) for products + patients with per-row validation + error report.

## PHASE 9 — Platform config & operations  ← BACKEND COMPLETE
- [x] Typed system settings (cached) — currency, timezone, locale, data-retention (>=10y enforced).
- [x] Maintenance mode: settings-driven read-only lockdown middleware (auth/settings paths stay open).
- [x] Per-user notification preferences (SMS/email/push/in-app).

## PHASE 10 — Reporting & analytics  ← BACKEND COMPLETE
- [x] Report engine: sales-by-day, expenses-by-category, Rx volume; saved/custom reports.
- [x] Sales forecast (moving-average + linear trend), dependency-free.

## PHASE 11 — Workflow engine, admin tooling  ← BACKEND COMPLETE
- [x] Generic approval workflow engine (any entity/action; no self-approval).
- [x] Role simulator (effective permissions per role, owner-only).
- [x] Activity timeline (per-entity, from immutable audit log).
- [x] Code39 barcode SVG generator (labels) — dependency-free, tested.

### Still roadmapped (not built)
- Client UI surfaces for Phases 8–11 (backend + APIs are done; pages pending).
- Real S3/OCR/Twilio/SendGrid/DocuSign providers (interfaces + stubs in place).
- Bull/Redis job queue; WebRTC/HLS streaming; QR (vs Code39); i18n/theme manager;
  backup/restore dashboard UI; custom-fields; keyboard shortcuts.

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
