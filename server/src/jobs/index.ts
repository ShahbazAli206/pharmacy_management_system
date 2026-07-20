import { scheduleDailyUTC, scheduleInterval, type ScheduledJobHandle } from '../services/scheduler';
import { runDailySalesSummaryJob } from './dailySalesSummary';
import { runRecallNotificationEscalation } from '../modules/recalls/recalls.service';
import { runRecallPollJob } from './recallPoll';
import { runCraRemittanceEscalation } from '../services/craRemittance';

let handles: ScheduledJobHandle[] = [];

/** Starts every scheduled background job. Called once from src/index.ts at boot. */
export function startScheduledJobs(): void {
  handles = [
    // 11:00 UTC ≈ early morning across Canadian time zones — covers the
    // previous full day's sales (spec §7: daily sales summary).
    scheduleDailyUTC('daily-sales-summary', 11, 0, async () => {
      await runDailySalesSummaryJob();
    }),
    // Checked well inside the 15-minute SLA window so a breach is caught
    // promptly rather than discovered up to an hour late (spec §12).
    scheduleInterval('recall-notification-sla', 5 * 60 * 1000, async () => {
      await runRecallNotificationEscalation();
    }),
    // Health Canada's dataset is itself updated once daily; polling every 2h
    // still catches same-day recalls promptly without hammering a public feed.
    // runImmediately=false: this hits a real external network endpoint, and a
    // dev server that auto-restarts on every file save shouldn't re-fetch it
    // every time — the first live poll happens after the first full interval.
    scheduleInterval('recall-feed-poll', 2 * 60 * 60 * 1000, async () => {
      await runRecallPollJob();
    }, false),
    // Same time as the daily sales summary — both are once-a-day housekeeping.
    scheduleDailyUTC('cra-remittance-escalation', 12, 0, async () => {
      await runCraRemittanceEscalation();
    }),
  ];
}

export function stopScheduledJobs(): void {
  handles.forEach((h) => h.stop());
  handles = [];
}
