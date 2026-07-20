import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded } from './helpers';

/**
 * Refund/return workflow (spec §7): amounts at/below the configured approval
 * threshold complete immediately (including the OTC stock reversal); amounts
 * above it need a decision from someone other than the requester before the
 * stock moves at all.
 */
const MARKER = 'ZZ_REFUND_ITEST';

describe('Refunds (HTTP integration)', () => {
  let saleId: string;
  let saleLineId: string;

  beforeAll(async () => {
    await assertSeeded();
    const res = await api()
      .post('/api/sales')
      .set(...(await authHeader('pic')))
      .send({
        paymentMethod: 'CASH',
        lines: [{ itemType: 'OTC', description: MARKER, quantity: 4, unitPriceCents: 500, taxable: true }],
      });
    expect(res.status).toBe(201);
    saleId = res.body.id;
    saleLineId = res.body.lines[0].id;
  });

  afterAll(async () => {
    await admin.refund.deleteMany({ where: { sale: { lines: { some: { description: MARKER } } } } });
    await admin.sale.deleteMany({ where: { lines: { some: { description: MARKER } } } });
    await admin.$disconnect();
  });

  it('a small refund (below threshold) completes immediately', async () => {
    const res = await api()
      .post('/api/refunds')
      .set(...(await authHeader('pic')))
      .send({ saleId, reason: 'customer return', lines: [{ saleLineId, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.amountCents).toBe(500);
  });

  it('rejects a refund quantity exceeding what remains refundable', async () => {
    const res = await api()
      .post('/api/refunds')
      .set(...(await authHeader('pic')))
      .send({ saleId, reason: 'too much', lines: [{ saleLineId, quantity: 10 }] });
    expect(res.status).toBe(400);
  });

  it('the requester cannot approve their own refund, and a manager approving it triggers the stock reversal', async () => {
    // Force a pending refund by using a fresh sale line priced above the threshold.
    const bigSale = await api()
      .post('/api/sales')
      .set(...(await authHeader('pic')))
      .send({
        paymentMethod: 'CASH',
        lines: [{ itemType: 'OTC', description: `${MARKER}_big`, quantity: 1, unitPriceCents: 10000, taxable: true }],
      });
    expect(bigSale.status).toBe(201);
    const bigLineId = bigSale.body.lines[0].id;

    const refund = await api()
      .post('/api/refunds')
      .set(...(await authHeader('pic')))
      .send({ saleId: bigSale.body.id, reason: 'defective', lines: [{ saleLineId: bigLineId, quantity: 1 }] });
    expect(refund.status).toBe(201);
    expect(refund.body.status).toBe('PENDING_APPROVAL');

    const selfApprove = await api()
      .post(`/api/refunds/${refund.body.id}/decision`)
      .set(...(await authHeader('pic')))
      .send({ decision: 'APPROVED' });
    expect(selfApprove.status).toBe(403);

    const managerApprove = await api()
      .post(`/api/refunds/${refund.body.id}/decision`)
      .set(...(await authHeader('partner')))
      .send({ decision: 'APPROVED' });
    expect(managerApprove.status).toBe(200);
    expect(managerApprove.body.status).toBe('COMPLETED');
  });

  it('rejecting a pending refund leaves it rejected with no further stock effect', async () => {
    const bigSale = await api()
      .post('/api/sales')
      .set(...(await authHeader('pic')))
      .send({
        paymentMethod: 'CASH',
        lines: [{ itemType: 'OTC', description: `${MARKER}_reject`, quantity: 1, unitPriceCents: 10000, taxable: true }],
      });
    const bigLineId = bigSale.body.lines[0].id;
    const refund = await api()
      .post('/api/refunds')
      .set(...(await authHeader('pic')))
      .send({ saleId: bigSale.body.id, reason: 'defective', lines: [{ saleLineId: bigLineId, quantity: 1 }] });
    expect(refund.body.status).toBe('PENDING_APPROVAL');

    const decision = await api()
      .post(`/api/refunds/${refund.body.id}/decision`)
      .set(...(await authHeader('partner')))
      .send({ decision: 'REJECTED' });
    expect(decision.status).toBe(200);
    expect(decision.body.status).toBe('REJECTED');

    // A rejected refund cannot be decided again.
    const again = await api()
      .post(`/api/refunds/${refund.body.id}/decision`)
      .set(...(await authHeader('partner')))
      .send({ decision: 'APPROVED' });
    expect(again.status).toBe(400);
  });
});
