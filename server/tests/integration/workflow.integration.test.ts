import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded } from './helpers';

/**
 * A core end-to-end workflow driven entirely over HTTP as the pharmacist
 * (PIC): register a patient, attach clinical sub-records, then read back the
 * patient, the location dashboard, on-hand inventory, and confirm the action
 * landed in the immutable audit trail. Exercises auth → RBAC → RLS-scoped
 * writes → reads → audit in one path.
 */
const MARKER = 'ZZ_ITEST_FLOW';

describe('Core clinical workflow (HTTP integration)', () => {
  let patientId: string;

  beforeAll(async () => {
    await assertSeeded();
  });

  afterAll(async () => {
    await admin.patient.deleteMany({ where: { lastName: { startsWith: MARKER } } });
    await admin.$disconnect();
  });

  it('pharmacist registers a patient at their location', async () => {
    const res = await api()
      .post('/api/patients')
      .set(...(await authHeader('pic')))
      .send({
        firstName: 'Workflow',
        lastName: MARKER,
        dateOfBirth: '1975-03-14',
        gender: 'FEMALE',
        healthCard: '1234-567-890-AB', // field-level encrypted at rest
        phone: '416-555-0199',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    // PII round-trips through encryption for an authorized reader.
    expect(res.body.healthCard).toBe('1234-567-890-AB');
    patientId = res.body.id;
  });

  it('attaches an allergy and a chronic condition', async () => {
    const h = await authHeader('pic');
    const allergy = await api()
      .post(`/api/patients/${patientId}/allergies`)
      .set(...h)
      .send({ substance: 'Penicillin', reaction: 'Hives', severity: 'HIGH' });
    expect(allergy.status).toBe(201);

    const condition = await api()
      .post(`/api/patients/${patientId}/conditions`)
      .set(...h)
      .send({ name: 'Hypertension', diagnosis: 'Essential' });
    expect(condition.status).toBe(201);
  });

  it('reads the patient back with nested clinical records', async () => {
    const res = await api()
      .get(`/api/patients/${patientId}`)
      .set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    expect(res.body.allergies).toHaveLength(1);
    expect(res.body.allergies[0].substance).toBe('Penicillin');
    expect(res.body.conditions).toHaveLength(1);
    expect(res.body.conditions[0].name).toBe('Hypertension');
  });

  it('the location dashboard reflects the pharmacist scope', async () => {
    const res = await api()
      .get('/api/dashboard/location')
      .set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('SINGLE_LOCATION');
    expect(res.body.patientCount).toBeGreaterThanOrEqual(1);
  });

  it('on-hand inventory is readable and reports seeded stock', async () => {
    const res = await api().get('/api/inventory').set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Seed stocks 3 products at the first location; each reports a rolled-up qty.
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body as { quantityOnHand: number }[]) {
      expect(typeof item.quantityOnHand).toBe('number');
    }
  });

  it('the patient creation is recorded in the audit trail (location-scoped)', async () => {
    const res = await api()
      .get('/api/audit?entity=Patient&action=CREATE&pageSize=100')
      .set(...(await authHeader('pic')));
    expect(res.status).toBe(200);
    const entry = res.body.items.find(
      (a: { entityId: string; action: string }) => a.entityId === patientId && a.action === 'CREATE',
    );
    expect(entry, 'expected a CREATE audit entry for the new patient').toBeTruthy();
  });
});
