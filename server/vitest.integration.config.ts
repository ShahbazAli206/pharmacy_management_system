import { defineConfig } from 'vitest/config';

/**
 * Integration test config. These drive the real Express app with supertest
 * against the live PostgreSQL database (RLS active, app connects as
 * `pharmacy_app`). They exercise auth, RBAC, location-scoping/RLS, and a core
 * workflow end-to-end over HTTP.
 *
 * Run sequentially in a single fork: the tests share a seeded database and the
 * auth endpoints are rate-limited, so parallel files would race and trip limits.
 * Longer timeouts accommodate real DB round-trips + bcrypt.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
