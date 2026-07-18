# Pharmacy Management System — Web Client (Phase 1)

React + TypeScript (Vite) frontend for the PMS API. Single codebase serving both
the owner and partner/location experiences, gated by JWT role + permissions.

## Setup

```bash
cd client
npm install
```

`.env` sets the API base URL (defaults to `http://localhost:4000/api`):
```
VITE_API_URL=http://localhost:4000/api
```

## Run

```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

The backend (`../server`) must be running for login and data to work.

## What's here (Phase 1)
- **Login** with session restore and seed-account hint.
- **Auth context** — access + refresh tokens in localStorage; automatic one-shot
  token refresh on 401 (concurrent 401s collapse into a single refresh).
- **Role-based routing** — owners land on the consolidated overview; other roles
  are routed to their location dashboard. Nav items render by permission.
- **Owner Overview** — totals + per-location table (staff, patients, compliance dot).
- **Location dashboard** — scoped stats + compliance checklist progress.
- **Patients** — searchable, paginated list (decrypted PII shown to authorized roles).

Client-side permission checks mirror—but never replace—the server-side RBAC;
the API re-validates every request.

## Next
Patient create/edit forms, chart exports (PDF/CSV), WebSocket live updates, and
the modules from Phases 2–6 (see `../ROADMAP.md`).
