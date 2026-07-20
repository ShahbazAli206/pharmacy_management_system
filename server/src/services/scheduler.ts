/**
 * Minimal in-process job scheduler — no Bull/Redis dependency (see
 * services/queue.ts for the job-queue abstraction that DOES gain a Redis
 * backend when configured). This is deliberately just `setTimeout`/`setInterval`
 * with drift-correction and error isolation: the spec's scheduled jobs here
 * (daily sales summary, recall polling, automated backups) are periodic
 * housekeeping tasks with no retry/priority/concurrency-control requirements
 * that would justify a real queue.
 *
 * Only ever started from src/index.ts (the actual running process) — never
 * imported by src/app.ts, so `createApp()` in tests never spins up a timer.
 */

export interface ScheduledJobHandle {
  stop(): void;
}

function runSafely(label: string, task: () => Promise<void>): void {
  task().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[scheduler] "${label}" failed:`, err);
  });
}

/** Pure helper (unit-tested independently of any timer): ms from `now` until the next UTC hh:mm. */
export function msUntilNextUTC(hourUTC: number, minuteUTC: number, now = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUTC, minuteUTC, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Runs `task` once at/after the next UTC hh:mm, then every 24h from that
 * point — recomputing the delay each cycle so a slow task or event-loop
 * jitter can't accumulate drift the way a naive `setInterval(24h)` would.
 */
export function scheduleDailyUTC(label: string, hourUTC: number, minuteUTC: number, task: () => Promise<void>): ScheduledJobHandle {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    runSafely(label, task);
    timer = setTimeout(tick, msUntilNextUTC(hourUTC, minuteUTC));
  };

  timer = setTimeout(tick, msUntilNextUTC(hourUTC, minuteUTC));
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/**
 * Runs `task` every `intervalMs`. Errors never stop the interval.
 * `runImmediately` (default true) fires once at startup before the first
 * full interval elapses — set to false for jobs that hit an external
 * network resource, so a dev server's frequent auto-restarts don't hammer it.
 */
export function scheduleInterval(
  label: string,
  intervalMs: number,
  task: () => Promise<void>,
  runImmediately = true,
): ScheduledJobHandle {
  if (runImmediately) runSafely(label, task);
  const timer = setInterval(() => runSafely(label, task), intervalMs);
  return { stop: () => clearInterval(timer) };
}
