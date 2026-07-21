import { defineConfig } from 'vitest/config';

/**
 * Combined coverage run (unit + integration together) — spec §16 requires
 * measuring coverage, not just having tests. Unit tests alone can't show
 * true coverage of the service files: most of their branches are exercised
 * by the HTTP-level integration tests (which hit the live DB), not the
 * DB-independent unit tests. Needs the same live-DB + sequential-fork setup
 * as vitest.integration.config.ts. Run via `npm run test:coverage`.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/docs/**', 'src/config/**'],
    },
  },
});
