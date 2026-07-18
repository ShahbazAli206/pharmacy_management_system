import { PrismaClient } from '@prisma/client';
import supertest from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/app';

/**
 * Shared harness for HTTP-level integration tests.
 *
 * These drive the real Express app (via supertest) against the live seeded
 * PostgreSQL database with row-level security active. The app connects as the
 * least-privilege `pharmacy_app` role, so tests exercise the exact runtime path
 * a real client hits — auth, DB-backed RBAC, and RLS location isolation.
 *
 * Prerequisites (see STATUS.md): Postgres running on :5433 and the seed applied
 * (owner/partner/pic users, 16 pharmacies). `assertSeeded()` fails fast with a
 * readable message if either is missing, instead of a wall of opaque errors.
 */

export const SEED_PASSWORD = 'ChangeMe123!';

export const SEED_USERS = {
  owner: 'owner@pharmacy.ca',
  partner: 'partner1@pharmacy.ca',
  pic: 'pic1@pharmacy.ca',
} as const;

export type SeedRole = keyof typeof SEED_USERS;

// One app instance per test file (vitest isolates modules per file), so each
// file gets its own in-memory rate-limiter state.
export const app = createApp();
export const api = () => supertest(app);

/**
 * Superuser client (bypasses RLS) used only for test setup/teardown — e.g.
 * deleting patient rows the app has no delete endpoint for. Never used to
 * exercise the code under test.
 */
export const admin = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

export interface LoggedIn {
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: string;
  pharmacyId: string | null;
  permissions: string[];
}

const tokenCache = new Map<SeedRole, LoggedIn>();

/** Log in a seeded user, returning the full login payload. Not cached. */
export async function login(role: SeedRole): Promise<LoggedIn> {
  const res = await api()
    .post('/api/auth/login')
    .send({ email: SEED_USERS[role], password: SEED_PASSWORD });

  if (res.status !== 200) {
    throw new Error(
      `Login for ${SEED_USERS[role]} failed (${res.status}). ` +
        `Is Postgres up on :5433 and seeded? Body: ${JSON.stringify(res.body)}`,
    );
  }

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    userId: res.body.user.id,
    role: res.body.user.role,
    pharmacyId: res.body.user.pharmacyId,
    permissions: res.body.user.permissions,
  };
}

/**
 * Log in once per role and reuse the session across tests in a file. Keeps the
 * total login count under the auth rate limit (20 / 15 min per IP).
 */
export async function session(role: SeedRole): Promise<LoggedIn> {
  const cached = tokenCache.get(role);
  if (cached) return cached;
  const fresh = await login(role);
  tokenCache.set(role, fresh);
  return fresh;
}

/** Bearer auth header for a cached session. */
export async function authHeader(role: SeedRole): Promise<[string, string]> {
  const { accessToken } = await session(role);
  return ['Authorization', `Bearer ${accessToken}`];
}

/**
 * Fail fast (in a beforeAll) if the DB isn't reachable/seeded. Surfaces one
 * clear message rather than every test throwing its own login error.
 */
export async function assertSeeded(): Promise<void> {
  try {
    await login('owner');
  } catch (err) {
    throw new Error(
      'Integration tests require a running, seeded database.\n' +
        '  1. Start Postgres: pg_ctl ... -o "-p 5433" start (see STATUS.md)\n' +
        '  2. Seed it: cd server && npm run db:seed (with DATABASE_URL as superuser)\n' +
        `Original error: ${(err as Error).message}`,
    );
  }
}

/** Resolve the two pharmacy ids used by the scoping tests: partner's own (A) + another (B). */
export async function twoPharmacyIds(): Promise<{ locationA: string; locationB: string }> {
  const owner = await session('owner');
  const res = await api()
    .get('/api/dashboard/owner')
    .set('Authorization', `Bearer ${owner.accessToken}`);
  expect(res.status).toBe(200);

  const partner = await session('partner');
  const locationA = partner.pharmacyId!;
  const other = res.body.locations.find((l: { id: string }) => l.id !== locationA);
  if (!other) throw new Error('Expected at least two seeded pharmacies for scoping tests');
  return { locationA, locationB: other.id };
}
