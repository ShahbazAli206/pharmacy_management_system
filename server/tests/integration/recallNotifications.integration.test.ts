import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded, session } from './helpers';

/**
 * Recall broadcast to PICs + the 15-minute SLA backstop (spec §12). Ingesting
 * a recall against a DIN with stock should immediately dispatch a RECALL
 * notification to every PIC at the affected location; a notification stuck
 * PENDING/FAILED past the SLA window should get escalated into a CRITICAL
 * compliance alert by the sweep.
 */
const MARKER = 'ZZ_RECALL_ITEST';

describe('Recall notifications (HTTP integration)', () => {
  let pharmacyId: string;
  let din: string;

  beforeAll(async () => {
    await assertSeeded();
    const pic = await session('pic');
    pharmacyId = pic.pharmacyId!;
    const inv = await api().get(`/api/inventory?pharmacyId=${pharmacyId}`).set(...(await authHeader('owner')));
    din = inv.body[0].product.din;
  });

  afterAll(async () => {
    await admin.quarantineRecord.deleteMany({ where: { recall: { recallNumber: { startsWith: MARKER } } } });
    await admin.drugRecall.deleteMany({ where: { recallNumber: { startsWith: MARKER } } });
    await admin.notification.deleteMany({ where: { subject: { contains: MARKER } } });
    await admin.complianceAlert.deleteMany({ where: { type: 'RECALL_NOTIFICATION_SLA_BREACH', message: { contains: MARKER } } });
    await admin.$disconnect();
  });

  it('ingesting a recall immediately dispatches a SENT notification to the PIC', async () => {
    const recallNumber = `${MARKER}-${Date.now()}`;
    const res = await api()
      .post('/api/recalls/ingest')
      .set(...(await authHeader('owner')))
      .send({ recallNumber, din, productName: `${MARKER} Drug`, reason: 'contamination', risk: 'TYPE_I' });
    expect(res.status).toBe(201);
    expect(res.body.locationsAffected).toBeGreaterThanOrEqual(1);

    const notifications = await api()
      .get(`/api/notifications?pharmacyId=${pharmacyId}`)
      .set(...(await authHeader('owner')));
    const recallNotif = notifications.body.find((n: { subject: string }) => n.subject.includes(recallNumber));
    expect(recallNotif, 'expected a notification for this recall').toBeTruthy();
    expect(recallNotif.status).toBe('SENT');
  });

  it('a notification stuck past the 15-minute SLA gets escalated to a CRITICAL alert', async () => {
    // Simulate an undeliverable notification (no resolvable contact) that's
    // already 20 minutes old — the escalation sweep should retry dispatch
    // (still fails, no contact) then raise the SLA-breach alert.
    const stuck = await admin.notification.create({
      data: {
        pharmacyId,
        channel: 'EMAIL',
        type: 'RECALL',
        subject: `${MARKER} stuck`,
        message: `${MARKER} message`,
        status: 'PENDING',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    });

    const sweep = await api().post('/api/recalls/notifications/escalate').set(...(await authHeader('owner')));
    expect(sweep.status).toBe(200);
    expect(sweep.body.escalated).toBeGreaterThanOrEqual(1);

    const alerts = await api()
      .get(`/api/compliance/alerts?pharmacyId=${pharmacyId}`)
      .set(...(await authHeader('owner')));
    const breach = alerts.body.find(
      (a: { relatedId: string; type: string }) => a.relatedId === stuck.id && a.type === 'RECALL_NOTIFICATION_SLA_BREACH',
    );
    expect(breach, 'expected a CRITICAL SLA-breach alert for the stuck notification').toBeTruthy();
    expect(breach.severity).toBe('CRITICAL');

    // Tag the alert so afterAll's cleanup filter (message contains MARKER) can find it — the
    // alert message embeds the notification id, not our MARKER, so widen the filter here.
    await admin.complianceAlert.update({ where: { id: breach.id }, data: { message: `${breach.message} ${MARKER}` } });
  });
});
