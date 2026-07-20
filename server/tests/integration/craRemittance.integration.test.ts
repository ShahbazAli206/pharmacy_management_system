import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded, session } from './helpers';

/**
 * CPP/EI (CRA) remittance due-date tracking + alerting (spec §11). A PAYROLL
 * expense gets an auto-computed due date; the escalation sweep raises a
 * WARNING as it approaches and escalates the SAME alert to CRITICAL once
 * overdue (not a duplicate).
 */
const MARKER = 'ZZ_CRA_ITEST';

describe('CRA remittance tracking (HTTP integration)', () => {
  let pharmacyId: string;

  beforeAll(async () => {
    await assertSeeded();
    const partner = await session('partner');
    pharmacyId = partner.pharmacyId!;
  });

  afterAll(async () => {
    await admin.complianceAlert.deleteMany({ where: { type: 'CRA_REMITTANCE_DUE', message: { contains: MARKER } } });
    await admin.expense.deleteMany({ where: { description: { startsWith: MARKER } } });
    await admin.$disconnect();
  });

  it('a PAYROLL expense gets an auto-computed due date (15th of the following month, UTC)', async () => {
    const res = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({ category: 'PAYROLL', description: `${MARKER} regular`, amountCents: 100000, incurredOn: '2026-07-15' });
    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe('2026-08-15T00:00:00.000Z');
  });

  it('an explicit dueDate is never overridden by the auto-computed one', async () => {
    const res = await api()
      .post('/api/finance/expenses')
      .set(...(await authHeader('partner')))
      .send({
        category: 'PAYROLL',
        description: `${MARKER} explicit`,
        amountCents: 100000,
        incurredOn: '2026-07-15',
        dueDate: '2026-07-20',
      });
    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe('2026-07-20T00:00:00.000Z');
  });

  it('the escalation sweep raises WARNING for a due-soon remittance, then escalates the same alert to CRITICAL once overdue', async () => {
    const expense = await admin.expense.create({
      data: {
        pharmacyId,
        category: 'PAYROLL',
        description: `${MARKER} escalation`,
        amountCents: 50000,
        incurredOn: new Date(),
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'SUBMITTED',
        submittedByUserId: (await session('partner')).userId,
      },
    });

    const sweep1 = await api().post('/api/finance/cra-remittances/escalate').set(...(await authHeader('owner')));
    expect(sweep1.status).toBe(201);
    const afterFirst = await admin.complianceAlert.findFirst({ where: { relatedType: 'Expense', relatedId: expense.id } });
    expect(afterFirst?.severity).toBe('WARNING');
    await admin.complianceAlert.update({ where: { id: afterFirst!.id }, data: { message: `${afterFirst!.message} ${MARKER}` } });

    await admin.expense.update({ where: { id: expense.id }, data: { dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    const sweep2 = await api().post('/api/finance/cra-remittances/escalate').set(...(await authHeader('owner')));
    expect(sweep2.status).toBe(201);

    const afterSecond = await admin.complianceAlert.findFirst({ where: { relatedType: 'Expense', relatedId: expense.id } });
    expect(afterSecond?.id).toBe(afterFirst!.id); // same alert, not a duplicate
    expect(afterSecond?.severity).toBe('CRITICAL');
  });

  it('the upcoming-remittances list reflects an unpaid PAYROLL expense', async () => {
    const res = await api()
      .get(`/api/finance/cra-remittances?pharmacyId=${pharmacyId}`)
      .set(...(await authHeader('owner')));
    expect(res.status).toBe(200);
    const found = res.body.find((r: { description: string }) => r.description.startsWith(MARKER));
    expect(found, 'expected the test PAYROLL expense in the upcoming-remittances list').toBeTruthy();
  });
});
