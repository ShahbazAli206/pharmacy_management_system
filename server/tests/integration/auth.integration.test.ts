import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, session, assertSeeded, SEED_USERS, SEED_PASSWORD } from './helpers';

/**
 * HTTP-level auth flow: login (positive/negative), the authenticated /me
 * endpoint, refresh-token rotation, and logout revocation — driven end-to-end
 * against the live DB.
 */
describe('Auth (HTTP integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  describe('POST /api/auth/login', () => {
    it('rejects wrong credentials with 401', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: SEED_USERS.owner, password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      // No account enumeration: same error whether or not the email exists.
      expect(res.body.accessToken).toBeUndefined();
    });

    it('rejects an unknown email with 401', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: 'nobody@pharmacy.ca', password: SEED_PASSWORD });
      expect(res.status).toBe(401);
    });

    it('400s on a malformed body (missing password)', async () => {
      const res = await api().post('/api/auth/login').send({ email: SEED_USERS.owner });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('issues tokens + identity for valid credentials', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: SEED_USERS.owner, password: SEED_PASSWORD });
      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.user.role).toBe('SYSTEM_OWNER');
      expect(res.body.user.pharmacyId).toBeNull();
      expect(Array.isArray(res.body.user.permissions)).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('401s with no Authorization header', async () => {
      const res = await api().get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('401s on a malformed Authorization header', async () => {
      const res = await api().get('/api/auth/me').set('Authorization', 'Basic abc123');
      expect(res.status).toBe(401);
    });

    it('401s on a tampered bearer token', async () => {
      const { accessToken } = await session('owner');
      const res = await api()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}tampered`);
      expect(res.status).toBe(401);
    });

    it('returns the caller identity + live permissions for a valid token', async () => {
      const { accessToken } = await session('owner');
      const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(SEED_USERS.owner);
      expect(res.body.role).toBe('SYSTEM_OWNER');
      // Owner holds the consolidated-dashboard permission.
      expect(res.body.permissions).toContain('dashboard:owner');
    });
  });

  describe('Refresh-token rotation & logout', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      // Fresh login so we don't disturb the shared cached sessions.
      const first = await login('pic');

      const rotated = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken });
      expect(rotated.status).toBe(200);
      expect(typeof rotated.body.accessToken).toBe('string');
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);

      // The consumed token must not be usable again (rotation = single use).
      const replay = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken });
      expect(replay.status).toBe(401);

      // The freshly rotated token still works.
      const again = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken });
      expect(again.status).toBe(200);
    });

    it('revokes the refresh token on logout', async () => {
      const s = await login('pic');

      const out = await api().post('/api/auth/logout').send({ refreshToken: s.refreshToken });
      expect(out.status).toBe(204);

      const afterLogout = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: s.refreshToken });
      expect(afterLogout.status).toBe(401);
    });
  });
});
