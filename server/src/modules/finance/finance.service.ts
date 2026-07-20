import { ExpenseCategory } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, notFound } from '../../utils/httpError';

interface Period {
  from: Date;
  to: Date;
}

function resolvePeriod(from?: string, to?: string): Period {
  const now = new Date();
  return {
    from: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
    to: to ? new Date(to) : now,
  };
}

/** Profit & loss for a single location over a period. */
export async function profitAndLoss(auth: AuthContext, pharmacyId: string, from?: string, to?: string) {
  assertLocationAccess(auth, pharmacyId);
  const period = resolvePeriod(from, to);

  const sales = await prisma.sale.findMany({
    where: { pharmacyId, createdAt: { gte: period.from, lte: period.to } },
    select: { subtotalCents: true, taxCents: true },
  });
  const revenueCents = sales.reduce((s, x) => s + x.subtotalCents, 0);
  const taxCollectedCents = sales.reduce((s, x) => s + x.taxCents, 0);

  // Only approved/paid expenses count against P&L.
  const expenses = await prisma.expense.findMany({
    where: {
      pharmacyId,
      status: { in: ['APPROVED', 'PAID'] },
      incurredOn: { gte: period.from, lte: period.to },
    },
    select: { category: true, amountCents: true },
  });

  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountCents;
  const totalExpensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  return {
    pharmacyId,
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    revenueCents,
    totalExpensesCents,
    netIncomeCents: revenueCents - totalExpensesCents,
    expensesByCategory: byCategory,
    taxCollectedCents,
    transactionCount: sales.length,
  };
}

/** Consolidated P&L across all locations (owner only). */
export async function consolidatedPL(auth: AuthContext, from?: string, to?: string) {
  if (!isOwner(auth)) throw badRequest('Consolidated reporting is owner-only');
  const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, name: true, code: true } });

  const perLocation = [];
  let revenue = 0;
  let expenses = 0;
  let tax = 0;
  for (const p of pharmacies) {
    const pl = await profitAndLoss(auth, p.id, from, to);
    perLocation.push({ pharmacy: p, ...pl });
    revenue += pl.revenueCents;
    expenses += pl.totalExpensesCents;
    tax += pl.taxCollectedCents;
  }

  return {
    period: resolvePeriodString(from, to),
    totals: {
      revenueCents: revenue,
      totalExpensesCents: expenses,
      netIncomeCents: revenue - expenses,
      taxCollectedCents: tax,
    },
    perLocation,
  };
}

function resolvePeriodString(from?: string, to?: string) {
  const p = resolvePeriod(from, to);
  return { from: p.from.toISOString(), to: p.to.toISOString() };
}

/** Split a location's net income by partner ownership basis points. */
export async function profitDistribution(auth: AuthContext, pharmacyId: string, from?: string, to?: string) {
  assertLocationAccess(auth, pharmacyId);
  const pl = await profitAndLoss(auth, pharmacyId, from, to);
  const owners = await prisma.partnerOwnership.findMany({ where: { pharmacyId } });

  const totalBp = owners.reduce((s, o) => s + o.basisPoints, 0);
  const distribution = owners.map((o) => ({
    userId: o.userId,
    partnerName: o.partnerName,
    basisPoints: o.basisPoints,
    percentage: o.basisPoints / 100,
    shareCents: Math.round((pl.netIncomeCents * o.basisPoints) / 10000),
  }));

  return {
    pharmacyId,
    netIncomeCents: pl.netIncomeCents,
    totalBasisPointsAllocated: totalBp,
    unallocatedBasisPoints: 10000 - totalBp,
    distribution,
  };
}

export async function setOwnership(
  auth: AuthContext,
  pharmacyId: string,
  entries: Array<{ userId: string; partnerName: string; basisPoints: number }>,
) {
  assertLocationAccess(auth, pharmacyId);
  const total = entries.reduce((s, e) => s + e.basisPoints, 0);
  if (total > 10000) throw badRequest('Ownership exceeds 100% (10000 basis points)');
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) throw notFound('Pharmacy not found');

  return prisma.$transaction(async (tx) => {
    await tx.partnerOwnership.deleteMany({ where: { pharmacyId } });
    for (const e of entries) {
      await tx.partnerOwnership.create({
        data: { pharmacyId, userId: e.userId, partnerName: e.partnerName, basisPoints: e.basisPoints },
      });
    }
    return tx.partnerOwnership.findMany({ where: { pharmacyId } });
  });
}

/** CRA-oriented HST/GST + expense summary for a period. */
export async function taxSummary(auth: AuthContext, requestedPharmacyId?: string, from?: string, to?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);
  const period = resolvePeriod(from, to);

  const sales = await prisma.sale.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}), createdAt: { gte: period.from, lte: period.to } },
    select: { taxCents: true, subtotalCents: true, province: true },
  });
  const taxCollected = sales.reduce((s, x) => s + x.taxCents, 0);
  const taxableSales = sales.reduce((s, x) => s + x.subtotalCents, 0);

  const expenses = await prisma.expense.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      status: { in: ['APPROVED', 'PAID'] },
      incurredOn: { gte: period.from, lte: period.to },
    },
    select: { taxCents: true },
  });
  const taxPaidOnExpenses = expenses.reduce((s, e) => s + e.taxCents, 0); // input tax credits

  return {
    period: resolvePeriodString(from, to),
    taxCollectedCents: taxCollected,
    inputTaxCreditsCents: taxPaidOnExpenses,
    netRemittanceCents: taxCollected - taxPaidOnExpenses,
    taxableSalesCents: taxableSales,
  };
}

/**
 * CPP/EI remittance tracking (spec §11): unpaid PAYROLL expenses with their
 * (auto-computed or explicit) CRA due date, so the Finance page can show
 * what's coming due without waiting for the alert sweep to fire.
 */
export async function craRemittances(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);

  const rows = await prisma.expense.findMany({
    where: {
      category: 'PAYROLL',
      status: { in: ['SUBMITTED', 'APPROVED'] },
      dueDate: { not: null },
      ...(pharmacyId ? { pharmacyId } : {}),
    },
    include: { pharmacy: { select: { name: true, code: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return rows.map((e) => ({
    id: e.id,
    pharmacy: e.pharmacy,
    description: e.description,
    amountCents: e.amountCents,
    dueDate: e.dueDate,
    daysUntilDue: Math.ceil((e.dueDate!.getTime() - now.getTime()) / 86_400_000),
    overdue: e.dueDate!.getTime() < now.getTime(),
  }));
}

export const EXPENSE_CATEGORIES = Object.values(ExpenseCategory);

const monthKey = (d: Date) => d.toISOString().slice(0, 7); // "YYYY-MM"
// UTC throughout — avoids drifting a UTC-parsed input date ("2026-07-01" -> UTC
// midnight) into the prior month when reconstructed via local getFullYear/getMonth
// on a server running in a negative UTC-offset timezone.
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Upsert a location's monthly budget for one category. */
export async function setBudget(auth: AuthContext, pharmacyId: string, category: string, month: string, amountCents: number) {
  assertLocationAccess(auth, pharmacyId);
  const monthDate = monthStart(new Date(month));

  return prisma.budget.upsert({
    where: { pharmacyId_category_month: { pharmacyId, category: category as never, month: monthDate } },
    update: { amountCents },
    create: { pharmacyId, category: category as never, month: monthDate, amountCents },
  });
}

/** List a location's budgets, optionally scoped to a month range. */
export async function listBudgets(auth: AuthContext, pharmacyId: string, from?: string, to?: string) {
  assertLocationAccess(auth, pharmacyId);
  return prisma.budget.findMany({
    where: {
      pharmacyId,
      ...(from || to
        ? { month: { ...(from ? { gte: monthStart(new Date(from)) } : {}), ...(to ? { lte: monthStart(new Date(to)) } : {}) } }
        : {}),
    },
    orderBy: [{ month: 'asc' }, { category: 'asc' }],
  });
}

/**
 * Budget vs. actual variance for a single month. Actual = approved/paid expenses
 * incurred within the month, grouped by category (same accrual rule as P&L).
 */
export async function budgetVariance(auth: AuthContext, pharmacyId: string, month?: string) {
  assertLocationAccess(auth, pharmacyId);
  const monthDate = monthStart(month ? new Date(month) : new Date());
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const [budgets, expenses] = await Promise.all([
    prisma.budget.findMany({ where: { pharmacyId, month: monthDate } }),
    prisma.expense.findMany({
      where: { pharmacyId, status: { in: ['APPROVED', 'PAID'] }, incurredOn: { gte: monthDate, lte: monthEnd } },
      select: { category: true, amountCents: true },
    }),
  ]);

  const actualByCategory: Record<string, number> = {};
  for (const e of expenses) actualByCategory[e.category] = (actualByCategory[e.category] ?? 0) + e.amountCents;

  const categories = new Set([...budgets.map((b) => b.category), ...Object.keys(actualByCategory)]);
  const lines = [...categories].map((category) => {
    const budgetedCents = budgets.find((b) => b.category === category)?.amountCents ?? 0;
    const actualCents = actualByCategory[category] ?? 0;
    const varianceCents = actualCents - budgetedCents;
    return {
      category,
      budgetedCents,
      actualCents,
      varianceCents,
      variancePct: budgetedCents === 0 ? null : Math.round((varianceCents / budgetedCents) * 1000) / 10,
    };
  });

  return {
    pharmacyId,
    month: monthKey(monthDate),
    lines: lines.sort((a, b) => a.category.localeCompare(b.category)),
    totals: {
      budgetedCents: lines.reduce((s, l) => s + l.budgetedCents, 0),
      actualCents: lines.reduce((s, l) => s + l.actualCents, 0),
      varianceCents: lines.reduce((s, l) => s + l.varianceCents, 0),
    },
  };
}

/**
 * Cash-flow forecast: monthly net cash flow (revenue minus paid-out expenses)
 * history over the trailing window, projected `horizon` months ahead using the
 * same moving-average + linear-trend method as the sales forecast (Phase 10) —
 * deterministic and dependency-free.
 */
export async function cashFlowForecast(auth: AuthContext, pharmacyId: string, months = 6, horizon = 3) {
  assertLocationAccess(auth, pharmacyId);
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { pharmacyId, createdAt: { gte: windowStart } },
      select: { createdAt: true, totalCents: true },
    }),
    prisma.expense.findMany({
      where: { pharmacyId, status: { in: ['APPROVED', 'PAID'] }, incurredOn: { gte: windowStart } },
      select: { incurredOn: true, amountCents: true, taxCents: true },
    }),
  ]);

  const revenueByMonth = new Map<string, number>();
  for (const s of sales) revenueByMonth.set(monthKey(s.createdAt), (revenueByMonth.get(monthKey(s.createdAt)) ?? 0) + s.totalCents);
  const expenseByMonth = new Map<string, number>();
  for (const e of expenses) {
    const k = monthKey(e.incurredOn);
    expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + e.amountCents + e.taxCents);
  }

  const history = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    const k = monthKey(d);
    const revenueCents = revenueByMonth.get(k) ?? 0;
    const expensesCents = expenseByMonth.get(k) ?? 0;
    history.push({ month: k, revenueCents, expensesCents, netCashFlowCents: revenueCents - expensesCents });
  }

  const values = history.map((h) => h.netCashFlowCents);
  const n = values.length;
  const avg = n === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / n);
  const meanX = (n - 1) / 2;
  let num = 0;
  let den = 0;
  values.forEach((y, i) => {
    num += (i - meanX) * (y - avg);
    den += (i - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;

  const forecast = [];
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    forecast.push({ month: monthKey(d), netCashFlowCents: Math.round(avg + slope * (n - 1 + i)) });
  }

  return { pharmacyId, history, forecast, method: `moving-average(${months}mo) + linear trend` };
}

/**
 * Accounts-payable aging (spec §8.2). Payables = approved-but-unpaid expenses
 * (status APPROVED). Each is aged by its due date (falling back to incurredOn),
 * bucketed current / 1–30 / 31–60 / 61–90 / 90+ days overdue. Owner may scope to
 * one location or see all; non-owners see their own.
 */
export async function apAging(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);

  const payables = await prisma.expense.findMany({
    where: { status: 'APPROVED', ...(pharmacyId ? { pharmacyId } : {}) },
    include: { pharmacy: { select: { code: true, name: true } } },
    orderBy: { dueDate: 'asc' },
  });

  const buckets = {
    current: { count: 0, amountCents: 0 },
    d1_30: { count: 0, amountCents: 0 },
    d31_60: { count: 0, amountCents: 0 },
    d61_90: { count: 0, amountCents: 0 },
    d90plus: { count: 0, amountCents: 0 },
  };

  const items = payables.map((e) => {
    const owed = e.amountCents + e.taxCents;
    const due = e.dueDate ?? e.incurredOn;
    const overdueDays = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    const bucket: keyof typeof buckets =
      overdueDays <= 0 ? 'current'
      : overdueDays <= 30 ? 'd1_30'
      : overdueDays <= 60 ? 'd31_60'
      : overdueDays <= 90 ? 'd61_90'
      : 'd90plus';
    buckets[bucket].count += 1;
    buckets[bucket].amountCents += owed;
    return {
      id: e.id,
      vendor: e.vendor,
      description: e.description,
      category: e.category,
      pharmacy: e.pharmacy,
      dueDate: due,
      overdueDays: Math.max(0, overdueDays),
      amountCents: owed,
    };
  });

  return {
    buckets,
    totalOwedCents: items.reduce((s, i) => s + i.amountCents, 0),
    count: items.length,
    items,
  };
}
