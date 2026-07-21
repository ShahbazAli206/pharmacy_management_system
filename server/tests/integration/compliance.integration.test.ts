import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded, session } from './helpers';

/**
 * Compliance checklist generation, completion (incl. required-signature
 * enforcement), overdue escalation, score banding, alert resolution, and
 * license-expiry warnings (spec §10). compliance.service.ts had ~19%
 * measured coverage before this file.
 */
const MARKER = 'ZZ_COMPLIANCE_ITEST';

describe('Compliance (HTTP integration)', () => {
  let pharmacyId: string;
  let signatureTemplateId: string;
  let plainTemplateId: string;

  beforeAll(async () => {
    await assertSeeded();
    const pic = await session('pic');
    pharmacyId = pic.pharmacyId!;

    const signatureTemplate = await admin.complianceTaskTemplate.create({
      data: { key: `${MARKER}_SIG`, title: `${MARKER} signature task`, frequency: 'DAILY', timesPerDay: 1, requiresSignature: true },
    });
    signatureTemplateId = signatureTemplate.id;

    const plainTemplate = await admin.complianceTaskTemplate.create({
      data: { key: `${MARKER}_PLAIN`, title: `${MARKER} plain task`, frequency: 'DAILY', timesPerDay: 1, requiresSignature: false },
    });
    plainTemplateId = plainTemplate.id;
  });

  afterAll(async () => {
    await admin.complianceAlert.deleteMany({ where: { message: { contains: MARKER } } });
    await admin.complianceRecord.deleteMany({ where: { templateId: { in: [signatureTemplateId, plainTemplateId] } } });
    await admin.complianceTaskTemplate.deleteMany({ where: { id: { in: [signatureTemplateId, plainTemplateId] } } });
    await admin.$disconnect();
  });

  it('generates today\'s checklist idempotently', async () => {
    const first = await api()
      .post('/api/compliance/checklist/generate')
      .set(...(await authHeader('pic')));
    expect(first.status).toBe(201);
    expect(first.body.created).toBeGreaterThanOrEqual(2); // at least our two new templates

    const second = await api()
      .post('/api/compliance/checklist/generate')
      .set(...(await authHeader('pic')));
    expect(second.status).toBe(201);
    expect(second.body.created).toBe(0); // already generated — unique constraint means nothing new
  });

  it('lists the generated checklist for today', async () => {
    const res = await api().get('/api/compliance/checklist').set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    const ours = res.body.filter((r: { label: string }) => r.label.startsWith(MARKER));
    expect(ours).toHaveLength(2);
  });

  it('rejects completing a signature-required task with no signature', async () => {
    const record = await admin.complianceRecord.findFirst({ where: { templateId: signatureTemplateId, pharmacyId } });
    const res = await api()
      .post(`/api/compliance/checklist/${record!.id}/complete`)
      .set(...(await authHeader('pic')))
      .send({ notes: 'no signature attached' });
    expect(res.status).toBe(400);
  });

  it('completes a signature-required task once a signature is provided', async () => {
    const record = await admin.complianceRecord.findFirst({ where: { templateId: signatureTemplateId, pharmacyId } });
    const res = await api()
      .post(`/api/compliance/checklist/${record!.id}/complete`)
      .set(...(await authHeader('pic')))
      .send({ signature: 'data:image/png;base64,abc123' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
  });

  it('completes a plain task without a signature', async () => {
    const record = await admin.complianceRecord.findFirst({ where: { templateId: plainTemplateId, pharmacyId } });
    const res = await api()
      .post(`/api/compliance/checklist/${record!.id}/complete`)
      .set(...(await authHeader('pic')))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
  });

  it('the escalation sweep marks an overdue PENDING task overdue and raises an alert', async () => {
    // Simulate a second pharmacy's task that's genuinely overdue by 3 hours.
    const overdueRecord = await admin.complianceRecord.create({
      data: {
        pharmacyId,
        templateId: plainTemplateId,
        dueDate: new Date(new Date().setHours(0, 0, 0, 0)),
        slot: 1, // distinct from slot 0 used by the auto-generated row above
        dueAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        label: `${MARKER} overdue task`,
      },
    });

    const res = await api().post('/api/compliance/escalate').set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    expect(res.body.markedOverdue).toBeGreaterThanOrEqual(1);

    const updated = await admin.complianceRecord.findUnique({ where: { id: overdueRecord.id } });
    expect(updated?.status).toBe('OVERDUE');

    const alerts = await admin.complianceAlert.findMany({ where: { relatedId: overdueRecord.id, type: 'OVERDUE_TASK' } });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('lists and resolves an open compliance alert', async () => {
    const list = await api().get('/api/compliance/alerts').set(...(await authHeader('pic')));
    expect(list.status).toBe(200);
    const ourAlert = list.body.find((a: { message: string }) => a.message.includes(MARKER));
    expect(ourAlert).toBeTruthy();

    const resolved = await api()
      .post(`/api/compliance/alerts/${ourAlert.id}/resolve`)
      .set(...(await authHeader('pic')));
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('RESOLVED');
  });

  it('reports a compliance score with a Green/Yellow/Red band', async () => {
    const res = await api().get('/api/compliance/score').set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    expect(['GREEN', 'YELLOW', 'RED']).toContain(res.body.band);
    expect(typeof res.body.score).toBe('number');
  });

  it('reports license/permit expiry warnings bucketed by days remaining', async () => {
    const pic = await session('pic');
    const picUser = await admin.user.findUnique({ where: { id: pic.userId } });
    await admin.user.update({ where: { id: pic.userId }, data: { licenseExpiry: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000) } });

    try {
      const res = await api().get('/api/compliance/license-expiry').set(...(await authHeader('pic')));
      expect(res.status).toBe(200);
      const mine = res.body.licenses.find((l: { name: string }) => l.name === `${picUser!.firstName} ${picUser!.lastName}`);
      expect(mine, 'expected the PIC\'s own license in the warnings list').toBeTruthy();
      expect(mine.bucket).toBe('30');
    } finally {
      await admin.user.update({ where: { id: pic.userId }, data: { licenseExpiry: picUser!.licenseExpiry } });
    }
  });
});
