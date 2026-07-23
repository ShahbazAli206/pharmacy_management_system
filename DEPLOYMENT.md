# Pharmecy_App — Deployment Reference (testing setup)

Same three-service split as the Islamic Smart Assistant project: **Vercel**
(frontend) + **Hugging Face Spaces** (backend) + **Supabase** (database).
This stack is actually simpler than that one — no Redis, no websockets, no
background jobs — so it's just a static build + a plain Express container.

Backend is **not optional**: the client is a pure API consumer (`client/src/lib/api.ts`
calls `VITE_API_URL`), all data lives behind Prisma/Postgres, and auth/RLS
logic runs server-side. Vercel alone can't host this — it needs the Express
API running somewhere reachable, hence HF Spaces + Supabase.

---

## 1. Database — Supabase

1. Create a Supabase project (any region).
2. Get two connection strings from Project Settings -> Database:
   - **Direct connection** (port 5432) -> `DIRECT_URL`
   - **Transaction pooler** (port 6543) -> base of `DATABASE_URL`
3. Nothing else to set up manually — `prisma migrate deploy` (run
   automatically by `server/start.sh` on container boot) creates the schema,
   RLS policies, and the low-privilege `pharmacy_app` role itself.
4. After the first successful migration, `DATABASE_URL`'s user/password is
   `pharmacy_app` / `pharmacy_app_dev_pw` (see SECURITY TODO below).

## 2. Backend — Hugging Face Spaces

1. Create a new Space -> Docker -> "Blank".
2. Push `server/` to the Space's git repo (same two-remote pattern as the
   other project: GitHub for source of truth, HF Space as a second remote
   for deploys), with `Dockerfile.hf` renamed to `Dockerfile` in that push
   (HF Spaces looks for `Dockerfile` at the repo root), or configure the
   Space to point at `Dockerfile.hf` if using the alternate Dockerfile field.
3. In Space Settings -> Variables and secrets, set everything listed in
   `server/.env.production.example`.
4. Space builds, runs migrations, starts on port 7860. Your API base URL is
   `https://<space-name>.hf.space/api`.

## 3. Frontend — Vercel

1. Import the GitHub repo into Vercel.
2. **Root Directory**: set to `client` (this is a monorepo — client and
   server are siblings, not the repo root).
3. Framework preset: Vite (auto-detected). Build command `npm run build`,
   output `dist` (defaults are fine).
4. Before deploying, update `client/.env.production` with your real HF Space
   URL (Vite bakes `VITE_API_URL` into the build at build time — no Vercel
   dashboard env var needed since the file is committed, same convention as
   the existing `client/.env`).
5. `client/vercel.json` rewrites all routes to `index.html` — required
   because this is a client-side-routed SPA (`react-router-dom`
   `BrowserRouter`); without it, refreshing on any non-root route 404s.
6. Once deployed, update `CORS_ORIGIN` on the HF Space to the real
   `https://your-app.vercel.app` URL and restart the Space.

---

## Deploy order

Database exists implicitly (Supabase project creation) -> deploy backend
(runs migrations against it) -> deploy frontend pointed at the backend ->
update backend's `CORS_ORIGIN` to the real frontend URL.

---

## Deferred — security hardening (do this before real data goes in)

None of this blocks getting the app running for testing; all are noted
inline in `server/.env.production.example` too.

1. **Rotate the `pharmacy_app` role's password.** It's created by the
   `..._rls_location_isolation` migration with a hardcoded dev password
   (`pharmacy_app_dev_pw`) that's visible to anyone reading the repo. Run
   `ALTER ROLE pharmacy_app PASSWORD '<random>';` in the Supabase SQL editor
   and update `DATABASE_URL` to match.
2. **Backups aren't persistent on HF Spaces.** `pg_dump` output goes to the
   container's filesystem (`BACKUP_DIR`), which is wiped on every
   redeploy/restart. Fine for now; before relying on it, ship completed
   dumps somewhere durable (S3/R2) instead of leaving them on-container.
3. **JWT/encryption secrets**: make sure the values you generate for
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `FIELD_ENCRYPTION_KEY` in
   the HF Space are different from anything used in CI or local dev, and are
   never committed.
