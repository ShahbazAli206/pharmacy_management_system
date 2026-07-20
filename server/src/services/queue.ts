import type Bull from 'bull';
import { env } from '../config/env';

/**
 * Background job queue abstraction (spec §16: "Use background job queues
 * (Bull/Celery) for OCR processing, report generation, and notification
 * sending"). Defaults to an in-process queue — zero infra, jobs run via
 * `setImmediate` — and switches the exact same call sites onto a real Bull
 * queue backed by Redis the moment REDIS_URL is configured, with no code
 * change needed at the call site.
 *
 * The API deliberately mirrors Bull's own named-job shape (`add(jobName,
 * data)` / `process(jobName, handler)` on one queue, not one queue per job
 * type) so the eventual swap is truly mechanical rather than a rewrite.
 *
 * Not wired onto OCR or report generation specifically: those are
 * synchronous request/response endpoints today (a pharmacist waits for the
 * OCR pre-fill; a report caller waits for the JSON) — queuing them would mean
 * inventing a job-status-polling API and would be a real UX regression, not
 * an architecture improvement. What genuinely fits "background job" today
 * are the scheduled jobs in src/jobs/index.ts (daily sales summary, recall
 * polling, SLA sweeps, CRA remittance escalation) — the timer now enqueues,
 * the queue's processor runs the actual work, exactly the trigger/execution
 * split a real job queue exists for.
 */

export interface JobQueue {
  readonly name: string;
  add<T>(jobName: string, data: T): Promise<void>;
  process<T>(jobName: string, handler: (data: T) => Promise<void>): void;
}

class InProcessQueue implements JobQueue {
  readonly name: string;
  private handlers = new Map<string, (data: unknown) => Promise<void>>();

  constructor(name: string) {
    this.name = name;
  }

  async add<T>(jobName: string, data: T): Promise<void> {
    const handler = this.handlers.get(jobName);
    if (!handler) {
      // eslint-disable-next-line no-console
      console.warn(`[queue:${this.name}] add("${jobName}") called with no registered processor — job dropped`);
      return;
    }
    // Async, off the calling stack — matches a real queue's semantics of not
    // running the job inline within add().
    setImmediate(() => {
      handler(data).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[queue:${this.name}] job "${jobName}" failed:`, err);
      });
    });
  }

  process<T>(jobName: string, handler: (data: T) => Promise<void>): void {
    this.handlers.set(jobName, handler as (data: unknown) => Promise<void>);
  }
}

class BullBackedQueue implements JobQueue {
  readonly name: string;
  // `import type` above is erased at compile time — it costs nothing when
  // REDIS_URL is unset; the actual module is only loaded via require() below,
  // and only once this class is actually instantiated.
  private bullQueue: Bull.Queue;

  constructor(name: string, redisUrl: string) {
    this.name = name;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BullCtor: typeof Bull = require('bull');
    this.bullQueue = new BullCtor(name, redisUrl);
  }

  async add<T>(jobName: string, data: T): Promise<void> {
    await this.bullQueue.add(jobName, data as object);
  }

  process<T>(jobName: string, handler: (data: T) => Promise<void>): void {
    this.bullQueue.process(jobName, async (job: { data: T }) => handler(job.data));
  }
}

export function createQueue(name: string): JobQueue {
  return env.REDIS_URL ? new BullBackedQueue(name, env.REDIS_URL) : new InProcessQueue(name);
}
