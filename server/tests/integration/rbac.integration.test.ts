import { describe, it, expect, beforeAll } from 'vitest';
import { api, session, authHeader, assertSeeded } from './helpers';

/**
 * DB-backed RBAC enforcement over HTTP. Permissions come from the seeded
 * permission matrix (not the token), so these assert the real runtime path:
 * the same endpoint is 403 for a location partner and 200 for the owner, and
 * 401 with no token at all.
 *
 * Endpoints chosen are owner-only GETs the LOCATION_PARTNER role lacks in the
 * matrix (dashboard:owner, system:monitor, role:simulate) — read-only, so no
 * test data is mutated.
 */
const OWNER_ONLY_GETS = [
  { name: 'owner dashboard (dashboard:owner)', path: '/api/dashboard/owner' },
  { name: 'system health (system:monitor)', path: '/api/system/health' },
  { name: 'role simulator (role:simulate)', path: '/api/admin/role-simulator/CASHIER' },
];

describe('RBAC enforcement (HTTP integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  describe.each(OWNER_ONLY_GETS)('$name', ({ path }) => {
    it('401s without a token', async () => {
      const res = await api().get(path);
      expect(res.status).toBe(401);
    });

    it('403s for a location partner (permission not in their matrix)', async () => {
      const res = await api().get(path).set(...(await authHeader('partner')));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('200s for the owner (permission present)', async () => {
      const res = await api().get(path).set(...(await authHeader('owner')));
      expect(res.status).toBe(200);
    });
  });

  it('a partner CAN reach an endpoint their role does grant (location dashboard)', async () => {
    // Sanity check that 403s above are about the specific permission, not a
    // blanket block on the partner token.
    const res = await api().get('/api/dashboard/location').set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('SINGLE_LOCATION');
  });

  it('the public liveness probe needs no auth', async () => {
    const res = await api().get('/api/system/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('role simulator returns the exact matrix for a role (owner)', async () => {
    const res = await api()
      .get('/api/admin/role-simulator/CASHIER')
      .set(...(await authHeader('owner')));
    expect(res.status).toBe(200);
    // Cashier is "sales only, no patient history" per the spec.
    expect(res.body.permissions).toContain('pos:sell');
    expect(res.body.permissions).not.toContain('patient:read');
  });

  it('exposes matching role + permissions on /me for a partner', async () => {
    const partner = await session('partner');
    expect(partner.role).toBe('LOCATION_PARTNER');
    expect(partner.permissions).toContain('patient:read');
    expect(partner.permissions).not.toContain('dashboard:owner');
  });
});
