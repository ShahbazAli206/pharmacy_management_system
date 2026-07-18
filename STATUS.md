# Project Status — Pharmacy Management System

**Last updated:** 2026-07-19
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
| **2 Core Pharmacy** | Catalog, inventory (lots/FEFO/expiry/low-stock/auto-PO), Rx workflow + interaction engine (409 block), dispense/refills, POS (HST, Rx zero-rated), cash reconciliation | ✅ Smoke 36/36 · client ✅ |
| **3 Compliance & Narcotics** | Checklists (idempotent, signature-required), narcotics register + **discrepancy lock (423)** + resolve, recall ingest→quarantine, license/permit expiry, compliance score, audit viewer | ✅ Smoke 25/25 · client ✅ |
| **4 Financials** | Expense workflow (**no self-approval**), P&L per-location + consolidated, profit distribution (basis points), CRA HST/GST summary, renewals, CSV export | ✅ Smoke 23/23 · client ✅ |
| **5 Camera & Comms** | Camera registry + heartbeat + role-scoped grid, messaging + owner broadcast (**no cross-location leakage**), CASL refill reminders + dispatch (stub provider) | ✅ Smoke 23/23 · client ✅ |
| **7 Platform** | Feature flags (global + per-pharmacy override), global search, system health | ✅ Smoke · client ✅ (Admin) |
| **8 Docs/e-sign/import** | Document manager (pluggable storage), e-signature, CSV bulk import (per-row errors) | ✅ Smoke · **client ✅ (new)** |
| **9 Config/ops** | System settings (≥10y retention enforced), maintenance mode, notification prefs | ✅ Smoke · **client ✅ (new)** |
| **10 Reporting** | sales-by-day / expenses-by-category / Rx-volume / **sales forecast**, saved reports | ✅ Smoke · **client ✅ (new)** |
| **11 Workflow/admin** | Generic approval engine (no self-approval), role simulator, activity timeline, Code39 barcode | ✅ Smoke · **client ✅ (new)** |

**Infra done:** live PostgreSQL 17 (portable, `:5433`), 3 migrations applied, seed run
(16 pharmacies + full permission matrix), **RLS runtime cutover active** (app connects
as `pharmacy_app`).

**Verification:** every backend phase driven end-to-end against the live DB; Phases 8–11
client UIs driven in real Chrome (Playwright) — 17/17. 35 vitest unit tests pass, plus
**35 HTTP-level integration tests** (supertest vs live DB, RLS active) covering
auth/RBAC/location-scoping + a core clinical workflow.

**Bug fixes found & shipped during verification:** `ffc4e9d` (narcotics receipt on
controlled-stock receive), `f1761df` (maintenance-mode lockout), owner location-picker
for location-scoped writes (`76bbea3`).

---

## 🔲 LEFT (prioritized)

### 1. Phase 6 — QA & Hardening / Go-Live (the main remaining work)
- [x] **Integration tests (HTTP-level) for auth/RBAC/scoping + core workflow — DONE.** 35 supertest tests drive the real app against the live DB with RLS active (`cd server && npm run test:integration`). Covers login/refresh-rotation/logout/`/me`, owner-only 403-vs-200 RBAC, partner location isolation (RLS-invisible → 404), and a patient→allergy→dashboard→inventory→audit workflow. Unit tests remain `npm test` (35, DB-independent); `npm run test:all` runs both.
- [x] **Load test — 200 concurrent users — DONE.** autocannon harness `cd server && npm run loadtest` (needs DB up). Boots the app in-process with rate limiting disabled, drives 200 concurrent connections over a real read mix, and gates on p99 < 3s + zero errors. Local baseline: ~215 req/s, p99 ~1.9s, 0 errors/non-2xx. Rate limits are now env-tunable (`RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_MAX`, 0 = disabled).
- [ ] Penetration testing / security review
- [ ] Pharmacist UAT, training, phased rollout, DR drills

### 2. Real external integrations (currently pluggable stubs — need creds/services)
- [ ] OCR (Google Vision / AWS Textract) · [ ] Storage (real S3/Azure Blob)
- [ ] SMS/email (Twilio / SendGrid) · [ ] E-signature (DocuSign / Adobe Sign)
- [ ] Insurance adjudication (TELUS Health, etc.) · [ ] Payments (Moneris / Square)
- [ ] Payroll (Ceridian / ADP) · [ ] Health Canada DIN DB + scheduled MedEffect recall poll
- [ ] Bull/Redis job queue · [ ] WebRTC/HLS camera streaming
- [ ] PDF / QuickBooks / Sage export formats

### 3. Production readiness
- [ ] Canadian-residency hosting (AWS ca-central-1 / Azure Canada), TLS 1.3, CI/CD
- [ ] Rotate secrets before prod: `pharmacy_app` DB password, JWT secrets, `FIELD_ENCRYPTION_KEY`
- [ ] Backup / point-in-time recovery / DR runbook
- [ ] Managed PostgreSQL (replace the local portable instance)

### 4. Compliance sign-off gates (before production — non-negotiable per spec)
- [ ] Canadian pharmacy regulatory consultant review of the compliance module
- [ ] Privacy-lawyer review for PIPEDA + provincial acts
- [ ] Pharmacist UAT sign-off

### 5. Smaller roadmapped items
- [ ] i18n / theme manager · backup-restore UI · custom fields · keyboard shortcuts
- [ ] QR codes (Code39 built) · fine-grained "2h-after-due" overdue escalation (needs per-slot due times)

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
HTTP-level **integration tests** (`server/tests/integration/`, 35) and a **200-user load
test** (`server/loadtest/`, `npm run loadtest`) are both in place. Remaining Phase-6 items:
(a) **penetration / security review** (`/security-review` on the diff, plus dependency audit
+ secret rotation), and/or (b) extend integration coverage to the Rx-interaction 409 block
and narcotics discrepancy 423 lock. Then the go-live process work: managed Postgres, CI/CD,
and the compliance/privacy/pharmacist sign-off gates. Alternatively, wire one real external
provider (S3 / Twilio / SendGrid) behind the existing pluggable interfaces.
