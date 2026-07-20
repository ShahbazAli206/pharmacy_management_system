import { prisma } from '../config/prisma';
import { computeDailySummary } from '../modules/sales/sales.service';
import { dispatchPendingForPharmacy } from '../modules/notifications/notifications.service';

/**
 * Daily sales summary auto-emailed to the location partner(s) and the owner
 * (spec §7). Runs once per day (see src/index.ts) covering the day that just
 * ended, and is also exposed as an owner-triggerable manual run
 * (POST /admin/jobs/daily-sales-summary) for testing/demo purposes.
 */

function formatSummaryEmail(pharmacyName: string, summary: Awaited<ReturnType<typeof computeDailySummary>>): string {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const byMethod = Object.entries(summary.byPaymentMethod)
    .map(([method, cents]) => `  ${method}: ${money(cents)}`)
    .join('\n');
  return (
    `Daily sales summary for ${pharmacyName} — ${summary.date}\n\n` +
    `Transactions: ${summary.transactionCount}\n` +
    `Subtotal: ${money(summary.subtotalCents)}\n` +
    `Tax collected: ${money(summary.taxCents)}\n` +
    `Total takings: ${money(summary.totalCents)}\n\n` +
    `By payment method:\n${byMethod || '  (none)'}\n`
  );
}

export async function runDailySalesSummaryJob(day = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { status: 'ACTIVE' },
    include: { users: { where: { role: { name: 'LOCATION_PARTNER' }, isActive: true } } },
  });
  const owners = await prisma.user.findMany({ where: { role: { name: 'SYSTEM_OWNER' }, isActive: true } });

  let notificationsQueued = 0;
  for (const pharmacy of pharmacies) {
    const summary = await computeDailySummary(pharmacy.id, day);
    const body = formatSummaryEmail(pharmacy.name, summary);
    const recipients = [...pharmacy.users, ...owners];

    for (const user of recipients) {
      await prisma.notification.create({
        data: {
          pharmacyId: pharmacy.id,
          recipientUserId: user.id,
          channel: 'EMAIL',
          type: 'DAILY_SALES_SUMMARY',
          subject: `Daily sales summary — ${pharmacy.name} — ${summary.date}`,
          message: body,
        },
      });
      notificationsQueued++;
    }
    if (recipients.length > 0) await dispatchPendingForPharmacy(pharmacy.id);
  }

  return { pharmaciesProcessed: pharmacies.length, notificationsQueued };
}
