import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded, session } from './helpers';

/**
 * Expense workflow (no self-approval), P&L (per-location + consolidated),
 * partner profit distribution, CRA tax summary, budgets/variance, cash-flow
 * forecast, and AP aging (spec §8). finance.service.ts had ~9% measured
 * coverage before this file.
 */
const MARKER = 'ZZ_FINANCE_ITEST';

describe('Finance (HTTP integration)', () => {
  let pharmacyId: string;
  const createdExpenseIds: string[] = [];

  beforeAll(async () => {
    await assertSeeded();
    const partner = await session('partner');
    pharmacyId = partner.pharmacyId!;
  });

  afterAll(async () => {
    await admin.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
    await admin.partnerOwnership.deleteMany({ where: { partnerName: { startsWith: MARKER } } });
    await admin.budget.deleteMany({ where: { pharmacyId, category: 'MARKETING' } });
    await admin.$disconnect();
  });

  it('creates an expense in SUBMITTED status', async () => {
    const res = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({ category: 'MARKETING', description: `${MARKER} flyers`, amountCents: 5000, incurredOn: '2026-07-01' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUBMITTED');
    createdExpenseIds.push(res.body.id);
  });

  it('a PAYROLL expense auto-computes a CRA due date when none is given', async () => {
    const res = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({ category: 'PAYROLL', description: `${MARKER} payroll`, amountCents: 200000, incurredOn: '2026-07-15' });
    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe('2026-08-15T00:00:00.000Z');
    createdExpenseIds.push(res.body.id);
  });

  it('the submitter cannot approve their own expense', async () => {
    const expenseId = createdExpenseIds[0];
    const res = await api()
      .post(`/api/finance/expenses/${expenseId}/decision`)
      .set(...(await authHeader('partner')))
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('a different user approves the expense, then it can be marked paid', async () => {
    const expenseId = createdExpenseIds[0];
    const approve = await api()
      .post(`/api/finance/expenses/${expenseId}/decision`)
      .set(...(await authHeader('owner')))
      .send({ decision: 'APPROVED' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('APPROVED');

    const paid = await api().post(`/api/finance/expenses/${expenseId}/paid`).set(...(await authHeader('partner')));
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');
  });

  it('rejects a decision on an expense that is no longer SUBMITTED', async () => {
    const expenseId = createdExpenseIds[0];
    const res = await api()
      .post(`/api/finance/expenses/${expenseId}/decision`)
      .set(...(await authHeader('owner')))
      .send({ decision: 'REJECTED' });
    expect(res.status).toBe(400);
  });

  it('lists expenses filtered by category and date range', async () => {
    const res = await api()
      .get(`/api/finance/expenses?category=PAYROLL&from=2026-07-01&to=2026-07-31`)
      .set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.some((e: { id: string }) => e.id === createdExpenseIds[1])).toBe(true);
  });

  it('reports upcoming renewal alerts', async () => {
    const renewalExpense = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({
        category: 'INSURANCE',
        description: `${MARKER} liability policy`,
        amountCents: 100000,
        incurredOn: '2026-07-01',
        renewalDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
    createdExpenseIds.push(renewalExpense.body.id);

    const res = await api().get('/api/finance/expenses/renewals').set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.some((e: { id: string }) => e.id === renewalExpense.body.id)).toBe(true);
  });

  it('computes profit & loss for a location, including the paid expense', async () => {
    const res = await api().get(`/api/finance/pl?pharmacyId=${pharmacyId}&from=2026-07-01&to=2026-07-31`).set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.expensesByCategory.MARKETING).toBeGreaterThanOrEqual(5000);
    expect(res.body.totalExpensesCents).toBeGreaterThanOrEqual(5000);
  });

  it('consolidated P&L is owner-only', async () => {
    const asOwner = await api().get('/api/finance/pl/consolidated?from=2026-07-01&to=2026-07-31').set(...(await authHeader('owner')));
    expect(asOwner.status).toBe(200);
    expect(Array.isArray(asOwner.body.perLocation)).toBe(true);

    const asPartner = await api().get('/api/finance/pl/consolidated').set(...(await authHeader('partner')));
    expect(asPartner.status).toBe(400);
  });

  it('sets partner ownership and computes profit distribution', async () => {
    const partner = await session('partner');
    const setRes = await api()
      .put('/api/finance/ownership')
      .set(...(await authHeader('partner')))
      .send({ pharmacyId, entries: [{ userId: partner.userId, partnerName: `${MARKER} Partner`, basisPoints: 10000 }] });
    expect(setRes.status).toBe(200);

    const dist = await api()
      .get(`/api/finance/profit-distribution?pharmacyId=${pharmacyId}&from=2026-07-01&to=2026-07-31`)
      .set(...(await authHeader('partner')));
    expect(dist.status).toBe(200);
    expect(dist.body.totalBasisPointsAllocated).toBe(10000);
    expect(dist.body.distribution[0].percentage).toBe(100);
  });

  it('computes a CRA HST/GST tax summary', async () => {
    const res = await api().get(`/api/finance/tax-summary?pharmacyId=${pharmacyId}&from=2026-07-01&to=2026-07-31`).set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(typeof res.body.netRemittanceCents).toBe('number');
  });

  it('sets a monthly budget and computes variance against actual expenses', async () => {
    const setBudget = await api()
      .put('/api/finance/budgets')
      .set(...(await authHeader('partner')))
      .send({ pharmacyId, category: 'MARKETING', month: '2026-07-01', amountCents: 10000 });
    expect(setBudget.status).toBe(200);

    const list = await api().get(`/api/finance/budgets?pharmacyId=${pharmacyId}`).set(...(await authHeader('partner')));
    expect(list.status).toBe(200);
    expect(list.body.some((b: { category: string }) => b.category === 'MARKETING')).toBe(true);

    const variance = await api().get(`/api/finance/budget-variance?pharmacyId=${pharmacyId}&month=2026-07-01`).set(...(await authHeader('partner')));
    expect(variance.status).toBe(200);
    const marketingLine = variance.body.lines.find((l: { category: string }) => l.category === 'MARKETING');
    expect(marketingLine.budgetedCents).toBe(10000);
    expect(marketingLine.actualCents).toBeGreaterThanOrEqual(5000);
  });

  it('produces a cash-flow forecast with history and a projection', async () => {
    const res = await api().get(`/api/finance/cash-flow-forecast?pharmacyId=${pharmacyId}`).set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBeGreaterThan(0);
    expect(res.body.forecast.length).toBeGreaterThan(0);
  });

  it('buckets an approved-but-unpaid expense into AP aging', async () => {
    const apExpense = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({ category: 'UTILITIES', description: `${MARKER} unpaid hydro`, amountCents: 8000, incurredOn: '2026-06-01', dueDate: '2026-06-15' });
    createdExpenseIds.push(apExpense.body.id);
    await api()
      .post(`/api/finance/expenses/${apExpense.body.id}/decision`)
      .set(...(await authHeader('owner')))
      .send({ decision: 'APPROVED' });

    const res = await api().get(`/api/finance/ap-aging?pharmacyId=${pharmacyId}`).set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    const found = res.body.items.find((i: { id: string }) => i.id === apExpense.body.id);
    expect(found, 'expected the unpaid approved expense in AP aging').toBeTruthy();
    expect(found.overdueDays).toBeGreaterThan(0);
  });
});
