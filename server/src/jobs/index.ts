import { scheduleDailyUTC, scheduleInterval, type ScheduledJobHandle } from '../services/scheduler';
import { createQueue } from '../services/queue';
import { runDailySalesSummaryJob } from './dailySalesSummary';
import { runRecallNotificationEscalation } from '../modules/recalls/recalls.service';
import { runRecallPollJob } from './recallPoll';
import { runCraRemittanceEscalation } from '../services/craRemittance';
import { runAutomatedBackupJob } from './automatedBackup';

/**
 * Every scheduled job's actual work runs through the background job queue
 * (spec §16) — the timer only enqueues; queue.process() below does the work.
 * In-process by default (no infra), transparently backed by Bull+Redis once
 * REDIS_URL is set — see services/queue.ts.
 */
const queue = createQueue('scheduled-jobs');

queue.process('daily-sales-summary', async () => {
  await runDailySalesSummaryJob();
});
queue.process('recall-notification-sla', async () => {
  await runRecallNotificationEscalation();
});
queue.process('recall-feed-poll', async () => {
  await runRecallPollJob();
});
queue.process('cra-remittance-escalation', async () => {
  await runCraRemittanceEscalation();
});
queue.process('automated-backup', async () => {
  await runAutomatedBackupJob();
});

let handles: ScheduledJobHandle[] = [];

/** Starts every scheduled background job. Called once from src/index.ts at boot. */
export function startScheduledJobs(): void {
  handles = [
    // 11:00 UTC ≈ early morning across Canadian time zones — covers the
    // previous full day's sales (spec §7: daily sales summary).
    scheduleDailyUTC('daily-sales-summary', 11, 0, async () => {
      await queue.add('daily-sales-summary', {});
    }),
    // Checked well inside the 15-minute SLA window so a breach is caught
    // promptly rather than discovered up to an hour late (spec §12).
    scheduleInterval('recall-notification-sla', 5 * 60 * 1000, async () => {
      await queue.add('recall-notification-sla', {});
    }),
    // Health Canada's dataset is itself updated once daily; polling every 2h
    // still catches same-day recalls promptly without hammering a public feed.
    // runImmediately=false: this hits a real external network endpoint, and a
    // dev server that auto-restarts on every file save shouldn't re-fetch it
    // every time — the first live poll happens after the first full interval.
    scheduleInterval('recall-feed-poll', 2 * 60 * 60 * 1000, async () => {
      await queue.add('recall-feed-poll', {});
    }, false),
    // Same time as the daily sales summary — both are once-a-day housekeeping.
    scheduleDailyUTC('cra-remittance-escalation', 12, 0, async () => {
      await queue.add('cra-remittance-escalation', {});
    }),
    // 09:00 UTC — before the other jobs, off-peak, well before business hours
    // across Canadian time zones (spec §13.2: automated daily backups).
    scheduleDailyUTC('automated-backup', 9, 0, async () => {
      await queue.add('automated-backup', {});
    }),
  ];
}

export function stopScheduledJobs(): void {
  handles.forEach((h) => h.stop());
  handles = [];
}
