/**
 * CPP/EI (CRA payroll source deduction) remittance due-date tracking + alerting
 * (spec §11: "CPP and EI remittance tracking — alert when CRA remittance due").
 *
 * CRA's actual due-date rule depends on the employer's assigned "remitter
 * type" (regular / quarterly / accelerated threshold 1 / threshold 2),
 * determined by average monthly withholding amount (AMWA) over the prior two
 * years — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/remitting-source-deductions/how-when-remit-due-dates.html.
 * Threshold 1/2 remit on a per-pay-period cadence (up to 4x/month), which
 * this app can't compute correctly without tracking individual pay-period
 * dates — it only has one incurredOn date per PAYROLL expense entry. Regular
 * and quarterly remitters (the vast majority of small/medium employers,
 * which this multi-location-pharmacy target market fits) map cleanly onto
 * that granularity, so only those two are supported; a genuine threshold-1/2
 * employer needs a real payroll system's remittance calendar, not a guess
 * from this app.
 */

import { prisma } from '../config/prisma';

export type CraRemitterType = 'REGULAR' | 'QUARTERLY';

// UTC throughout — incurredOn comes from a UTC-parsed "YYYY-MM-DD" input
// (`new Date("2026-07-15")` is UTC midnight); reconstructing via local
// getFullYear/getMonth on a server running in a negative UTC-offset
// timezone would drift the computed due date back a day (the exact bug
// finance.service.ts's monthStart already had to fix once — see its comment).

/** Regular: due the 15th of the month after the deductions were withheld. */
function regularDueDate(incurredOn: Date): Date {
  return new Date(Date.UTC(incurredOn.getUTCFullYear(), incurredOn.getUTCMonth() + 1, 15));
}

/** Quarterly: due the 15th of the month after the quarter (Jan/Apr/Jul/Oct 15). */
function quarterlyDueDate(incurredOn: Date): Date {
  const quarterEndMonth = Math.floor(incurredOn.getUTCMonth() / 3) * 3 + 2; // Mar/Jun/Sep/Dec (0-indexed)
  return new Date(Date.UTC(incurredOn.getUTCFullYear(), quarterEndMonth + 1, 15));
}

export function craRemittanceDueDate(incurredOn: Date, remitterType: CraRemitterType): Date {
  return remitterType === 'QUARTERLY' ? quarterlyDueDate(incurredOn) : regularDueDate(incurredOn);
}

const WARNING_WINDOW_MS = 5 * 24 * 60 * 60 * 1000; // flag as due-soon inside 5 days
const ALERT_TYPE = 'CRA_REMITTANCE_DUE';

/**
 * Escalation sweep (spec §11: "alert when CRA remittance due"). Any
 * not-yet-paid PAYROLL expense with a due date inside the warning window
 * raises a WARNING alert; once actually overdue it's upgraded to CRITICAL.
 * Unlike services/alerts.ts's raiseAlert (pure dedup, never changes an
 * existing open alert), this needs to escalate severity over time, so it
 * manages its own open-alert lookup rather than reusing that helper.
 */
export async function runCraRemittanceEscalation(now = new Date()) {
  const horizon = new Date(now.getTime() + WARNING_WINDOW_MS);

  const dueSoon = await prisma.expense.findMany({
    where: {
      category: 'PAYROLL',
      status: { in: ['SUBMITTED', 'APPROVED'] },
      dueDate: { not: null, lte: horizon },
    },
  });

  let raised = 0;
  let escalated = 0;
  for (const expense of dueSoon) {
    const overdue = expense.dueDate!.getTime() < now.getTime();
    const severity = overdue ? 'CRITICAL' : 'WARNING';
    const message = overdue
      ? `CRA source-deduction remittance for "${expense.description}" was due ${expense.dueDate!.toISOString().slice(0, 10)} and is still unpaid.`
      : `CRA source-deduction remittance for "${expense.description}" is due ${expense.dueDate!.toISOString().slice(0, 10)}.`;

    const existing = await prisma.complianceAlert.findFirst({
      where: { pharmacyId: expense.pharmacyId, type: ALERT_TYPE, relatedId: expense.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
    });

    if (!existing) {
      await prisma.complianceAlert.create({
        data: { pharmacyId: expense.pharmacyId, type: ALERT_TYPE, severity, message, relatedType: 'Expense', relatedId: expense.id },
      });
      raised++;
    } else if (existing.severity !== 'CRITICAL' && severity === 'CRITICAL') {
      await prisma.complianceAlert.update({ where: { id: existing.id }, data: { severity, message } });
      escalated++;
    }
  }
  return { checked: dueSoon.length, raised, escalated };
}
