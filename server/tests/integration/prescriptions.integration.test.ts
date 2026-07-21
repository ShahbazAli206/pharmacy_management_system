import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader, admin, assertSeeded, session } from './helpers';

/**
 * Full prescription lifecycle (spec §5.2/§6.2): interaction checking,
 * blocked-until-acknowledged saves, dispensing (stock decrement, refill
 * tracking, controlled-substance narcotics posting), and fill exhaustion.
 * prescriptions.service.ts had ~1% measured coverage before this file.
 */
const MARKER = 'ZZ_RX_ITEST';

describe('Prescriptions (HTTP integration)', () => {
  let pharmacyId: string;
  let prescriberId: string;
  let patientId: string;
  let plainProductId: string;
  let plainDin: string;
  let controlledProductId: string;
  let controlledDin: string;

  beforeAll(async () => {
    await assertSeeded();
    const pic = await session('pic');
    pharmacyId = pic.pharmacyId!;

    const prescriber = await api()
      .post('/api/prescribers')
      .set(...(await authHeader('pic')))
      .send({ firstName: MARKER, lastName: 'Prescriber', collegeRegNumber: `${MARKER}-COL` });
    prescriberId = prescriber.body.id;

    const patient = await api()
      .post('/api/patients')
      .set(...(await authHeader('pic')))
      .send({ firstName: MARKER, lastName: 'Patient', dateOfBirth: '1950-01-01', gender: 'OTHER' });
    patientId = patient.body.id;
    await api()
      .post(`/api/patients/${patientId}/allergies`)
      .set(...(await authHeader('pic')))
      .send({ substance: 'penicillin', severity: 'SEVERE' });

    plainDin = `${Date.now()}`.slice(-8);
    const plainProduct = await api()
      .post('/api/products')
      .set(...(await authHeader('owner')))
      .send({ din: plainDin, name: `${MARKER} Acetaminophen`, strength: '500mg', form: 'TABLET', schedule: 'OTC' });
    plainProductId = plainProduct.body.id;

    controlledDin = `${Date.now() + 1}`.slice(-8);
    const controlledProduct = await api()
      .post('/api/products')
      .set(...(await authHeader('owner')))
      .send({
        din: controlledDin,
        name: `${MARKER} Oxycodone`,
        strength: '10mg',
        form: 'TABLET',
        schedule: 'NARCOTIC',
        isControlled: true,
      });
    controlledProductId = controlledProduct.body.id;

    // Stock for both, so dispense has something to decrement.
    for (const productId of [plainProductId, controlledProductId]) {
      await api()
        .post('/api/inventory/receive')
        .set(...(await authHeader('partner')))
        .send({ productId, quantity: 100, unitCostCents: 100 });
    }
  });

  afterAll(async () => {
    await admin.dispensingRecord.deleteMany({ where: { prescription: { patientId } } });
    await admin.narcoticTxn.deleteMany({ where: { productId: controlledProductId } });
    await admin.prescription.deleteMany({ where: { patientId } });
    await admin.allergy.deleteMany({ where: { patient: { lastName: 'Patient', firstName: MARKER } } });
    await admin.patient.deleteMany({ where: { firstName: MARKER } });
    await admin.prescriber.deleteMany({ where: { firstName: MARKER } });
    await admin.stockLot.deleteMany({ where: { inventoryItem: { productId: { in: [plainProductId, controlledProductId] } } } });
    await admin.inventoryItem.deleteMany({ where: { productId: { in: [plainProductId, controlledProductId] } } });
    await admin.product.deleteMany({ where: { id: { in: [plainProductId, controlledProductId] } } });
    await admin.$disconnect();
  });

  it('the interaction-check endpoint flags an allergy conflict', async () => {
    // plainProduct has no interaction classes set, so instead verify the
    // allergy-conflict path directly against the controlled product by
    // tagging its interactionClasses to the patient's allergy substance.
    await admin.product.update({ where: { id: controlledProductId }, data: { interactionClasses: 'penicillin' } });
    const res = await api()
      .post('/api/prescriptions/interaction-check')
      .set(...(await authHeader('pic')))
      .send({ patientId, productId: controlledProductId });
    expect(res.status).toBe(200);
    expect(res.body.alerts.some((a: { type: string }) => a.type === 'ALLERGY')).toBe(true);
    await admin.product.update({ where: { id: controlledProductId }, data: { interactionClasses: '' } });
  });

  let plainPrescriptionId: string;

  it('creates a prescription with no blocking alerts directly', async () => {
    const res = await api()
      .post('/api/prescriptions')
      .set(...(await authHeader('pic')))
      .send({
        patientId,
        prescriberId,
        productId: plainProductId,
        directions: 'Take 1 tablet twice daily',
        quantity: 30,
        refillsAuthorized: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CREATED');
    plainPrescriptionId = res.body.prescription.id;
  });

  it('blocks a prescription with an unacknowledged allergy conflict, then allows it once acknowledged', async () => {
    await admin.product.update({ where: { id: controlledProductId }, data: { interactionClasses: 'penicillin' } });

    const blocked = await api()
      .post('/api/prescriptions')
      .set(...(await authHeader('pic')))
      .send({
        patientId,
        prescriberId,
        productId: controlledProductId,
        directions: 'Take 1 tablet as needed',
        quantity: 10,
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.requiresAcknowledgement).toBe(true);

    const acknowledged = await api()
      .post('/api/prescriptions')
      .set(...(await authHeader('pic')))
      .send({
        patientId,
        prescriberId,
        productId: controlledProductId,
        directions: 'Take 1 tablet as needed',
        quantity: 10,
        acknowledgeAlerts: true,
      });
    expect(acknowledged.status).toBe(201);
    expect(acknowledged.body.prescription.isControlled).toBe(true);

    await admin.product.update({ where: { id: controlledProductId }, data: { interactionClasses: '' } });
  });

  it('lists and reads back prescriptions scoped to the location', async () => {
    const list = await api().get(`/api/prescriptions?patientId=${patientId}`).set(...(await authHeader('pic')));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);

    const detail = await api().get(`/api/prescriptions/${plainPrescriptionId}`).set(...(await authHeader('pic')));
    expect(detail.status).toBe(200);
    expect(detail.body.patient.id).toBe(patientId);
  });

  it('dispensing decrements stock, records the fill, and tracks refills', async () => {
    const before = await api().get('/api/inventory').set(...(await authHeader('pic')));
    const qtyBefore = before.body.find((i: { product: { id: string } }) => i.product.id === plainProductId).quantityOnHand;

    const res = await api()
      .post(`/api/prescriptions/${plainPrescriptionId}/dispense`)
      .set(...(await authHeader('pic')))
      .send({ counsellingNotes: 'Discussed dosing schedule' });
    expect(res.status).toBe(201);
    expect(res.body.refillsRemaining).toBe(1); // 1 refill authorized, 1 used so far
    expect(res.body.isControlled).toBe(false);

    const after = await api().get('/api/inventory').set(...(await authHeader('pic')));
    const qtyAfter = after.body.find((i: { product: { id: string } }) => i.product.id === plainProductId).quantityOnHand;
    expect(qtyAfter).toBe(qtyBefore - 30);
  });

  it('dispensing a controlled substance posts to the narcotics register', async () => {
    const rxList = await api().get(`/api/prescriptions?patientId=${patientId}`).set(...(await authHeader('pic')));
    const controlledRx = rxList.body.find((r: { productId: string }) => r.din === controlledDin);

    const res = await api()
      .post(`/api/prescriptions/${controlledRx.id}/dispense`)
      .set(...(await authHeader('pic')))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.isControlled).toBe(true);

    const txns = await admin.narcoticTxn.findMany({ where: { productId: controlledProductId, type: 'DISPENSE' } });
    expect(txns.length).toBeGreaterThanOrEqual(1);
  });

  it('dispensing twice with the same idempotency key replays the original result instead of double-dispensing (offline-sync retry safety)', async () => {
    const rxRes = await api()
      .post('/api/prescriptions')
      .set(...(await authHeader('pic')))
      .send({ patientId, prescriberId, productId: plainProductId, directions: 'Take 1 tablet daily', quantity: 5 });
    const rxId = rxRes.body.prescription.id;
    const idempotencyKey = '11111111-2222-4333-8444-555555555555';

    const before = await api().get('/api/inventory').set(...(await authHeader('pic')));
    const qtyBefore = before.body.find((i: { product: { id: string } }) => i.product.id === plainProductId).quantityOnHand;

    const first = await api()
      .post(`/api/prescriptions/${rxId}/dispense`)
      .set(...(await authHeader('pic')))
      .send({ idempotencyKey });
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBeFalsy();

    const second = await api()
      .post(`/api/prescriptions/${rxId}/dispense`)
      .set(...(await authHeader('pic')))
      .send({ idempotencyKey });
    expect(second.status).toBe(201);
    expect(second.body.replayed).toBe(true);
    expect(second.body.record.id).toBe(first.body.record.id);

    const after = await api().get('/api/inventory').set(...(await authHeader('pic')));
    const qtyAfter = after.body.find((i: { product: { id: string } }) => i.product.id === plainProductId).quantityOnHand;
    expect(qtyAfter).toBe(qtyBefore - 5); // stock decremented once, not twice
  });

  it('exhausts fills and blocks a further dispense with 400', async () => {
    // plainPrescriptionId had 1 authorized refill; it was just used above (1 of 2 fills used).
    const res1 = await api()
      .post(`/api/prescriptions/${plainPrescriptionId}/dispense`)
      .set(...(await authHeader('pic')))
      .send({});
    expect(res1.status).toBe(201);
    expect(res1.body.refillsRemaining).toBe(0);

    const res2 = await api()
      .post(`/api/prescriptions/${plainPrescriptionId}/dispense`)
      .set(...(await authHeader('pic')))
      .send({});
    expect(res2.status).toBe(400);
  });
});
