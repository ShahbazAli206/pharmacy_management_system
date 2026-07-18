import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest } from '../../utils/httpError';

interface ReportParams {
  pharmacyId?: string;
  from?: string;
  to?: string;
}

function resolveScope(auth: AuthContext, requested?: string): string | null {
  if (isOwner(auth)) return requested ?? null;
  return auth.locationId;
}

function period(p: ReportParams) {
  const now = new Date();
  const from = p.from ? new Date(p.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = p.to ? new Date(p.to) : now;
  return { from, to };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Sales revenue grouped by day. */
export async function salesByDay(auth: AuthContext, params: ReportParams) {
  const pharmacyId = resolveScope(auth, params.pharmacyId);
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);
  const { from, to } = period(params);

  const sales = await prisma.sale.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}), createdAt: { gte: from, lte: to } },
    select: { createdAt: true, totalCents: true },
  });

  const buckets = new Map<string, number>();
  for (const s of sales) buckets.set(dayKey(s.createdAt), (buckets.get(dayKey(s.createdAt)) ?? 0) + s.totalCents);
  const series = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, cents]) => ({ date, valueCents: cents }));
  return { type: 'SALES_BY_DAY', series };
}

export async function expensesByCategory(auth: AuthContext, params: ReportParams) {
  const pharmacyId = resolveScope(auth, params.pharmacyId);
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);
  const { from, to } = period(params);

  const expenses = await prisma.expense.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}), status: { in: ['APPROVED', 'PAID'] }, incurredOn: { gte: from, lte: to } },
    select: { category: true, amountCents: true },
  });
  const buckets: Record<string, number> = {};
  for (const e of expenses) buckets[e.category] = (buckets[e.category] ?? 0) + e.amountCents;
  return { type: 'EXPENSES_BY_CATEGORY', data: buckets };
}

export async function rxVolume(auth: AuthContext, params: ReportParams) {
  const pharmacyId = resolveScope(auth, params.pharmacyId);
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);
  const { from, to } = period(params);

  const rx = await prisma.prescription.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}), createdAt: { gte: from, lte: to } },
    select: { createdAt: true },
  });
  const buckets = new Map<string, number>();
  for (const r of rx) buckets.set(dayKey(r.createdAt), (buckets.get(dayKey(r.createdAt)) ?? 0) + 1);
  const series = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, value: count }));
  return { type: 'RX_VOLUME', series };
}

/**
 * Forecast future daily sales using a simple moving average of the trailing
 * window. Deterministic and dependency-free; a production build would swap in a
 * seasonal model. Returns `horizon` projected points.
 */
export async function salesForecast(auth: AuthContext, params: ReportParams, horizon = 7, window = 7) {
  const { series } = await salesByDay(auth, params);
  if (series.length === 0) return { type: 'SALES_FORECAST', history: [], forecast: [] };

  const values = series.map((s) => s.valueCents);
  const trailing = values.slice(-window);
  const avg = Math.round(trailing.reduce((a, b) => a + b, 0) / trailing.length);

  // Linear trend over the trailing window for a mild slope.
  const n = trailing.length;
  const meanX = (n - 1) / 2;
  const meanY = avg;
  let num = 0;
  let den = 0;
  trailing.forEach((y, i) => {
    num += (i - meanX) * (y - meanY);
    den += (i - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;

  const lastDate = new Date(series[series.length - 1].date);
  const forecast = [];
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(lastDate.getTime() + i * 24 * 60 * 60 * 1000);
    forecast.push({ date: dayKey(d), valueCents: Math.max(0, Math.round(avg + slope * i)) });
  }
  return { type: 'SALES_FORECAST', history: series, forecast, method: `moving-average(${window}) + linear trend` };
}

export async function runReport(auth: AuthContext, type: string, params: ReportParams) {
  switch (type) {
    case 'SALES_BY_DAY':
      return salesByDay(auth, params);
    case 'EXPENSES_BY_CATEGORY':
      return expensesByCategory(auth, params);
    case 'RX_VOLUME':
      return rxVolume(auth, params);
    case 'SALES_FORECAST':
      return salesForecast(auth, params);
    default:
      throw badRequest(`Unknown report type: ${type}`);
  }
}
