/**
 * Load test — Phase 6 go-live gate.
 *
 * Spec (§4.3, §16 Testing): the API must sustain **200 concurrent users** and a
 * dashboard must respond in under 3 seconds. This harness drives a realistic
 * mix of authenticated read endpoints at 200 concurrent connections and fails
 * (non-zero exit) if latency or errors breach the thresholds — so it doubles as
 * a CI gate, not just a benchmark.
 *
 * Two modes:
 *   • In-process (default): boots the real Express app on a local port with the
 *     rate limiter disabled (200 users would otherwise be throttled to 429s) and
 *     HTTP logging off, then hammers it. Needs Postgres up + seeded (STATUS.md).
 *   • External: set TARGET=https://staging.example to load a deployed instance.
 *     Start that instance with RATE_LIMIT_MAX=0 for a representative run.
 *
 * Tunables (env): TARGET, LOADTEST_PORT (4100), LOADTEST_CONNECTIONS (200),
 *   LOADTEST_DURATION seconds (20), LOADTEST_P99_MS (3000).
 *
 * Run: `npm run loadtest`
 */

// These must be set BEFORE the app (and its env module) is imported below, so
// the in-process instance boots without rate limiting or request logging.
const IN_PROCESS = !process.env.TARGET;
if (IN_PROCESS) {
  process.env.RATE_LIMIT_MAX = '0';
  process.env.AUTH_RATE_LIMIT_MAX = '0';
  process.env.NODE_ENV = 'test';
  process.env.PORT = process.env.LOADTEST_PORT ?? '4100';
}

import type { Server } from 'http';
import autocannon from 'autocannon';

const PORT = Number(process.env.LOADTEST_PORT ?? '4100');
const BASE = process.env.TARGET?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS ?? '200');
const DURATION = Number(process.env.LOADTEST_DURATION ?? '20');
const P99_BUDGET_MS = Number(process.env.LOADTEST_P99_MS ?? '3000');

const SEED = { owner: 'owner@pharmacy.ca', partner: 'partner1@pharmacy.ca' };
const PASSWORD = 'ChangeMe123!';

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Login for ${email} failed (${res.status}). Is Postgres up on :5433 and seeded? ` +
        `See STATUS.md.`,
    );
  }
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function main() {
  let server: Server | undefined;

  if (IN_PROCESS) {
    const { createApp } = await import('../src/app');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, resolve);
    });
    // eslint-disable-next-line no-console
    console.log(`Booted in-process API on ${BASE} (rate limiting disabled, logging off)`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Targeting external instance at ${BASE}`);
  }

  // Authenticate a couple of representative users up front. The load phase then
  // reuses these bearer tokens (real steady-state traffic is authenticated reads,
  // not repeated logins).
  const [ownerToken, partnerToken] = await Promise.all([login(SEED.owner), login(SEED.partner)]);

  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

  // A mix mirroring real dashboards: partner-scoped reads (RLS active), the
  // owner consolidated overview, and the cheap public liveness probe.
  const requests: autocannon.Request[] = [
    { method: 'GET', path: '/api/dashboard/location', headers: bearer(partnerToken) },
    { method: 'GET', path: '/api/patients?pageSize=25', headers: bearer(partnerToken) },
    { method: 'GET', path: '/api/inventory', headers: bearer(partnerToken) },
    { method: 'GET', path: '/api/dashboard/owner', headers: bearer(ownerToken) },
    { method: 'GET', path: '/api/system/status' },
  ];

  // eslint-disable-next-line no-console
  console.log(
    `\nLoad: ${CONNECTIONS} concurrent connections for ${DURATION}s across ${requests.length} endpoints ` +
      `(p99 budget ${P99_BUDGET_MS}ms)\n`,
  );

  const result = await new Promise<autocannon.Result>((resolve, reject) => {
    const instance = autocannon(
      { url: BASE, connections: CONNECTIONS, duration: DURATION, requests },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
    autocannon.track(instance, { renderProgressBar: true, renderResultsTable: false });
  });

  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));

  // --- Report ---------------------------------------------------------------
  const totalReqs = result.requests.total;
  const rps = result.requests.average;
  const nonSuccess = result.non2xx;
  const success2xx = result['2xx'];
  const { errors, timeouts } = result;

  // eslint-disable-next-line no-console
  console.log('\n================ LOAD TEST RESULT ================');
  const rows: [string, string | number][] = [
    ['Target', BASE],
    ['Concurrent connections', CONNECTIONS],
    ['Duration (s)', result.duration],
    ['Total requests', totalReqs],
    ['Throughput (req/s avg)', Math.round(rps)],
    ['Latency mean (ms)', result.latency.mean],
    ['Latency p97.5 (ms)', result.latency.p97_5],
    ['Latency p99 (ms)', result.latency.p99],
    ['Latency max (ms)', result.latency.max],
    ['2xx responses', success2xx],
    ['non-2xx responses', nonSuccess],
    ['Errors', errors],
    ['Timeouts', timeouts],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log('==================================================\n');

  // --- Pass/fail gate -------------------------------------------------------
  const failures: string[] = [];
  if (success2xx === 0) failures.push('No successful (2xx) responses were recorded.');
  if (nonSuccess > 0) failures.push(`${nonSuccess} non-2xx responses (expected 0).`);
  if (errors > 0) failures.push(`${errors} connection errors (expected 0).`);
  if (timeouts > 0) failures.push(`${timeouts} timeouts (expected 0).`);
  if (result.latency.p99 > P99_BUDGET_MS)
    failures.push(`p99 latency ${result.latency.p99}ms exceeds ${P99_BUDGET_MS}ms budget.`);

  if (failures.length) {
    // eslint-disable-next-line no-console
    console.error('❌ LOAD TEST FAILED:');
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    `✅ PASS — sustained ${CONNECTIONS} concurrent users at ~${Math.round(rps)} req/s, ` +
      `p99 ${result.latency.p99}ms (< ${P99_BUDGET_MS}ms), 0 errors.`,
  );
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Load test aborted:', err instanceof Error ? err.message : err);
  process.exit(1);
});
