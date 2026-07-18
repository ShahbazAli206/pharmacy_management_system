import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { checkInteractions, InteractionAlert, parseClasses } from '../../services/drugInteractions';
import { decrementStockFEFO } from '../inventory/inventory.service';
import { postNarcoticTxn } from '../narcotics/narcotics.service';

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Run the interaction engine for a candidate drug against a patient profile. */
export async function runInteractionCheck(
  auth: AuthContext,
  patientId: string,
  productId: string,
): Promise<InteractionAlert[]> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { allergies: true },
  });
  if (!patient) throw notFound('Patient not found');
  assertLocationAccess(auth, patient.pharmacyId);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound('Product not found');

  const activeRx = await prisma.prescription.findMany({
    where: { patientId, status: 'ACTIVE' },
    include: { product: true },
  });

  return checkInteractions({
    candidate: { drugName: product.name, classes: parseClasses(product.interactionClasses) },
    activeMeds: activeRx.map((rx) => ({
      drugName: rx.drugName,
      classes: parseClasses(rx.product.interactionClasses),
    })),
    patientAgeYears: ageInYears(patient.dateOfBirth),
    patientAllergyClasses: patient.allergies.map((a) => a.substance),
  });
}

export interface CreatePrescriptionInput {
  patientId: string;
  prescriberId: string;
  productId: string;
  directions: string;
  quantity: number;
  refillsAuthorized?: number;
  scannedImagePath?: string;
  acknowledgeAlerts?: boolean;
}

export type CreateResult =
  | { status: 'BLOCKED'; alerts: InteractionAlert[] }
  | { status: 'CREATED'; alerts: InteractionAlert[]; prescription: unknown };

export async function createPrescription(
  auth: AuthContext,
  input: CreatePrescriptionInput,
): Promise<CreateResult> {
  const [patient, prescriber, product] = await Promise.all([
    prisma.patient.findUnique({ where: { id: input.patientId } }),
    prisma.prescriber.findUnique({ where: { id: input.prescriberId } }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);
  if (!patient) throw notFound('Patient not found');
  if (!prescriber) throw notFound('Prescriber not found');
  if (!product) throw notFound('Product not found');

  // All three must belong to the acting location.
  assertLocationAccess(auth, patient.pharmacyId);
  if (prescriber.pharmacyId !== patient.pharmacyId) {
    throw badRequest('Prescriber belongs to a different location');
  }

  const alerts = await runInteractionCheck(auth, input.patientId, input.productId);
  const blocking = alerts.some((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING');
  if (blocking && !input.acknowledgeAlerts) {
    // Pharmacist must explicitly acknowledge before the Rx is saved.
    return { status: 'BLOCKED', alerts };
  }

  const prescription = await prisma.prescription.create({
    data: {
      pharmacyId: patient.pharmacyId,
      patientId: patient.id,
      prescriberId: prescriber.id,
      productId: product.id,
      din: product.din,
      drugName: product.name,
      strength: product.strength,
      form: product.form,
      directions: input.directions,
      quantity: input.quantity,
      refillsAuthorized: input.refillsAuthorized ?? 0,
      isControlled: product.isControlled,
      scannedImagePath: input.scannedImagePath ?? null,
      createdByUserId: auth.userId,
    },
    include: { patient: { select: { firstName: true, lastName: true } }, prescriber: true, product: true },
  });

  return { status: 'CREATED', alerts, prescription };
}

export async function listPrescriptions(
  auth: AuthContext,
  opts: { patientId?: string; requestedPharmacyId?: string },
) {
  const pharmacyId = isOwner(auth) ? opts.requestedPharmacyId : auth.locationId;
  return prisma.prescription.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      prescriber: { select: { id: true, firstName: true, lastName: true } },
      dispensings: { orderBy: { dispensedAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPrescription(auth: AuthContext, id: string) {
  const rx = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: true,
      prescriber: true,
      product: true,
      dispensings: { include: { pharmacist: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!rx) throw notFound('Prescription not found');
  assertLocationAccess(auth, rx.pharmacyId);
  return rx;
}

export interface DispenseInput {
  quantity?: number;
  counsellingNotes?: string;
}

/**
 * Dispense a fill: verifies refills remain, decrements stock FEFO, records the
 * dispensing event, and advances refill count / status. Runs in a transaction.
 */
export async function dispense(auth: AuthContext, prescriptionId: string, input: DispenseInput) {
  const rx = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!rx) throw notFound('Prescription not found');
  assertLocationAccess(auth, rx.pharmacyId);

  if (rx.status !== 'ACTIVE') throw badRequest(`Prescription is ${rx.status}`);
  // First fill + authorized refills.
  const fillsAllowed = 1 + rx.refillsAuthorized;
  if (rx.refillsUsed >= fillsAllowed) throw badRequest('No fills remaining');

  const qty = input.quantity ?? rx.quantity;

  return prisma.$transaction(async (tx) => {
    const lot = await decrementStockFEFO(tx, rx.pharmacyId, rx.productId, qty);

    const record = await tx.dispensingRecord.create({
      data: {
        prescriptionId: rx.id,
        pharmacistUserId: auth.userId,
        quantity: qty,
        dinDispensed: rx.din,
        lotNumber: lot.lotNumber,
        expiryDate: lot.expiryDate,
        stockLotId: lot.primaryLotId,
        counsellingNotes: input.counsellingNotes ?? null,
      },
    });

    // Controlled substances post to the narcotics register (running balance).
    // This also enforces the discrepancy lock — throws 423 if the product is
    // locked by an unresolved count.
    if (rx.isControlled) {
      await postNarcoticTxn(tx, {
        pharmacyId: rx.pharmacyId,
        productId: rx.productId,
        type: 'DISPENSE',
        quantityChange: -qty,
        performedByUserId: auth.userId,
        referenceType: 'DispensingRecord',
        referenceId: record.id,
      });
    }

    const refillsUsed = rx.refillsUsed + 1;
    await tx.prescription.update({
      where: { id: rx.id },
      data: {
        refillsUsed,
        status: refillsUsed >= fillsAllowed ? 'COMPLETED' : 'ACTIVE',
      },
    });

    return { record, refillsRemaining: fillsAllowed - refillsUsed, isControlled: rx.isControlled };
  });
}

export function assertDispensePermission(auth: AuthContext) {
  if (!auth.permissions.has('prescription:dispense')) {
    throw forbidden('Dispensing requires a pharmacist role');
  }
}
