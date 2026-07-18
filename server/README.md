# Pharmacy Management System — API (Phase 1)

Node.js + Express + TypeScript backend with PostgreSQL (Prisma), JWT auth,
DB-backed RBAC, field-level PII encryption, and an append-only audit trail.

## Prerequisites
- Node.js 18+ (tested on v22)
- A running PostgreSQL instance (local or remote)

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Then edit `.env`:
- Set `DATABASE_URL` to your PostgreSQL connection string.
- Generate real secrets:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # FIELD_ENCRYPTION_KEY
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
  ```
  `FIELD_ENCRYPTION_KEY` **must** be 64 hex characters (32 bytes).

## Database

```bash
npm run prisma:generate     # generate the typed client
npm run prisma:migrate      # create + apply the initial migration
npm run db:seed             # 16 pharmacies, roles/permission matrix, sample users
```

Seed users (password `ChangeMe123!` — change immediately):
| Email | Role | Scope |
|-------|------|-------|
| owner@pharmacy.ca | System Owner | all locations |
| partner1@pharmacy.ca | Location Partner | first pharmacy |
| pic1@pharmacy.ca | Pharmacist-in-Charge | first pharmacy |

## Run

```bash
npm run dev      # ts-node-dev with reload
# or
npm run build && npm start
```

Server: `http://localhost:4000`. Health check: `GET /api/health`.

## API (Phase 1)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| POST | `/api/auth/login` | public | returns access + refresh tokens |
| POST | `/api/auth/refresh` | public | rotates refresh token |
| POST | `/api/auth/logout` | public | revokes refresh token |
| GET | `/api/auth/me` | authenticated | profile + permissions |
| GET | `/api/dashboard/owner` | `dashboard:owner` | consolidated overview |
| GET | `/api/dashboard/location` | `dashboard:location` | scoped location view |
| GET | `/api/patients` | `patient:read` | list (location-scoped) |
| GET | `/api/patients/:id` | `patient:read` | detail (decrypts PII) |
| POST | `/api/patients` | `patient:write` | create |
| PATCH | `/api/patients/:id` | `patient:write` | update |

### Quick smoke test

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@pharmacy.ca","password":"ChangeMe123!"}'

# use the accessToken:
curl -s http://localhost:4000/api/dashboard/owner \
  -H "Authorization: Bearer <accessToken>"
```

## Architecture notes
- **RBAC**: JWT carries `role` + `locationId`; permissions are loaded per-request
  from the DB permission matrix (`Role`→`RolePermission`→`Permission`), never
  hardcoded. Cross-location access is blocked at the API layer via
  `assertLocationAccess`.
- **PII encryption**: health card + insurance IDs are AES-256-GCM encrypted at
  rest (`src/utils/crypto.ts`), decrypted only for authorized readers.
- **Audit**: every login and patient read/write/create is written to an
  append-only `AuditLog` (`src/services/audit.ts`).

## Not yet implemented (see ../ROADMAP.md)
Prescriptions/OCR, inventory, POS, compliance checklists, financials, cameras,
notifications, MFA enforcement, and PostgreSQL row-level security policies are
scheduled for later phases.
