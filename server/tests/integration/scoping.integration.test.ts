import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, session, authHeader, admin, assertSeeded, twoPharmacyIds } from './helpers';

/**
 * Location isolation between partners — the spec's most critical rule ("zero
 * visibility into other locations", enforced at the API layer AND by row-level
 * security). Driven over HTTP against the live DB with RLS active.
 *
 * Note on the 404s: when a partner requests another location's patient by id,
 * RLS makes the row invisible, so the lookup returns null and the API responds
 * 404 (defense in depth) rather than 403 — the record's very existence is
 * hidden. Both are acceptable "denied" outcomes; we assert the row is not
 * readable.
 */
const MARKER = 'ZZ_ITEST_SCOPE';

// Track everything we create so afterAll can remove it (also sweeps leftovers
// from any earlier interrupted run, since we match by the marker prefix).
const createdIds: string[] = [];

describe('Location scoping & RLS (HTTP integration)', () => {
  let locationA: string;
  let locationB: string;
  let patientAId: string;
  let patientBId: string;

  beforeAll(async () => {
    await assertSeeded();
    ({ locationA, locationB } = await twoPharmacyIds());

    const owner = await session('owner');
    const mk = async (pharmacyId: string, firstName: string) => {
      const res = await api()
        .post('/api/patients')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          pharmacyId,
          firstName,
          lastName: MARKER,
          dateOfBirth: '1990-01-01',
          gender: 'OTHER',
        });
      expect(res.status).toBe(201);
      createdIds.push(res.body.id);
      return res.body.id as string;
    };

    // Owner can create at any location.
    patientAId = await mk(locationA, 'AlphaAtA');
    patientBId = await mk(locationB, 'BravoAtB');
  });

  afterAll(async () => {
    // Cascade removes allergies/conditions; match by marker to catch strays too.
    await admin.patient.deleteMany({ where: { lastName: { startsWith: MARKER } } });
    await admin.$disconnect();
  });

  it('owner can read patients at both locations', async () => {
    const h = await authHeader('owner');
    const a = await api().get(`/api/patients/${patientAId}`).set(...h);
    const b = await api().get(`/api/patients/${patientBId}`).set(...h);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.pharmacyId).toBe(locationA);
    expect(b.body.pharmacyId).toBe(locationB);
  });

  it("partner's patient list is scoped to their own location only", async () => {
    const res = await api()
      .get('/api/patients?pageSize=100')
      .set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    // Sees their own-location patient...
    expect(ids).toContain(patientAId);
    // ...and never the other location's, even in the same query.
    expect(ids).not.toContain(patientBId);
    // Every returned row belongs to their pharmacy.
    for (const p of res.body.items as { pharmacyId: string }[]) {
      expect(p.pharmacyId).toBe(locationA);
    }
  });

  it('partner can read a patient at their own location', async () => {
    const res = await api()
      .get(`/api/patients/${patientAId}`)
      .set(...(await authHeader('partner')));
    expect(res.status).toBe(200);
    expect(res.body.pharmacyId).toBe(locationA);
  });

  it("partner cannot read another location's patient (RLS-hidden → 404)", async () => {
    const res = await api()
      .get(`/api/patients/${patientBId}`)
      .set(...(await authHeader('partner')));
    expect(res.status).toBe(404);
  });

  it("partner cannot write another location's patient", async () => {
    const res = await api()
      .patch(`/api/patients/${patientBId}`)
      .set(...(await authHeader('partner')))
      .send({ city: 'Should Not Apply' });
    expect(res.status).toBe(404);
  });

  it('a partner-created patient is forced to their own location (body pharmacyId ignored)', async () => {
    // Non-owners cannot plant a record in another pharmacy by passing pharmacyId.
    const res = await api()
      .post('/api/patients')
      .set(...(await authHeader('partner')))
      .send({
        pharmacyId: locationB, // attempt to target another location
        firstName: 'CharlieForcedToA',
        lastName: MARKER,
        dateOfBirth: '1985-05-05',
        gender: 'OTHER',
      });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body.pharmacyId).toBe(locationA);
    expect(res.body.pharmacyId).not.toBe(locationB);
  });
});
