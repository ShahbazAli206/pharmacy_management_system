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

export const EXPENSE_CATEGORIES = Object.values(ExpenseCategory);
