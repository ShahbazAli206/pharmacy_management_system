import { defineConfig } from 'vitest/config';

/**
 * Unit test config (the default `npm test`). These tests are DB-independent —
 * pure logic (RBAC guards, JWT, tax, CSV, drug interactions). HTTP-level
 * integration tests live under tests/integration/ and need a live DB, so they
 * are excluded here and run via `npm run test:integration`.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
});
