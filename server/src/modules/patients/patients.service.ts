import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, resolveLocationScope } from '../../middleware/rbac';
import { decryptNullable, encryptNullable } from '../../utils/crypto';
import { notFound, badRequest } from '../../utils/httpError';
import { mergeCustomFields } from '../../services/customFields';

export interface PatientInput {
  pharmacyId?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO date
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
  preferredLanguage?: string;
  healthCard?: string | null;
  insurancePlan?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emergencyContact?: string | null;
  smsOptIn?: boolean;
  emailOptIn?: boolean;
  customFields?: Record<string, unknown>;
}

/** Shape returned to clients — decrypts PII for authorized readers. */
function toDto(p: Prisma.PatientGetPayload<{ include: { allergies: true; conditions: true } }>) {
  return {
    id: p.id,
    pharmacyId: p.pharmacyId,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    preferredLanguage: p.preferredLanguage,
    healthCard: decryptNullable(p.healthCardEnc),
    insurancePlan: decryptNullable(p.insurancePlanEnc),
    phone: p.phone,
    email: p.email,
    addressLine1: p.addressLine1,
    city: p.city,
    postalCode: p.postalCode,
    emergencyContact: p.emergencyContact,
    smsOptIn: p.smsOptIn,
    emailOptIn: p.emailOptIn,
    customFields: p.customFields as Record<string, unknown>,
    allergies: p.allergies,
    conditions: p.conditions,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPatients(
  auth: AuthContext,
  opts: { search?: string; requestedPharmacyId?: string; skip: number; take: number },
) {
  const scope = resolveLocationScope(auth, opts.requestedPharmacyId);

  const where: Prisma.PatientWhereInput = {
    ...(scope ? { pharmacyId: scope } : {}),
    ...(opts.search
      ? {
          OR: [
            { firstName: { contains: opts.search, mode: 'insensitive' } },
            { lastName: { contains: opts.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      include: { allergies: true, conditions: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: opts.skip,
      take: opts.take,
    }),
  ]);

  return { total, items: rows.map(toDto) };
}

export async function getPatient(auth: AuthContext, id: string) {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { allergies: true, conditions: true },
  });
  if (!patient) throw notFound('Patient not found');
  // Enforce location isolation at the API layer.
  assertLocationAccess(auth, patient.pharmacyId);
  return toDto(patient);
}

export async function createPatient(auth: AuthContext, input: PatientInput) {
  // Non-owners create only within their own location; owners must name one.
  const pharmacyId = auth.role === 'SYSTEM_OWNER' ? input.pharmacyId : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);

  const customFields = await mergeCustomFields('PATIENT', {}, input.customFields);

  const created = await prisma.patient.create({
    data: {
      pharmacyId,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      preferredLanguage: input.preferredLanguage ?? 'en',
      healthCardEnc: encryptNullable(input.healthCard),
      insurancePlanEnc: encryptNullable(input.insurancePlan),
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      emergencyContact: input.emergencyContact ?? null,
      smsOptIn: input.smsOptIn ?? false,
      emailOptIn: input.emailOptIn ?? false,
      customFields: customFields as Prisma.InputJsonObject,
    },
    include: { allergies: true, conditions: true },
  });
  return toDto(created);
}

// ---------------------------------------------------------------------------
// Allergy / chronic-condition sub-resources. Every mutation loads the parent
// patient first and enforces location isolation before writing.
// ---------------------------------------------------------------------------

export interface AllergyInput {
  substance: string;
  reaction?: string | null;
  severity?: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
}

export interface ConditionInput {
  name: string;
  diagnosis?: string | null;
}

/** Loads a patient for a write and asserts the caller may touch its location. */
async function assertPatientWritable(auth: AuthContext, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, pharmacyId: true },
  });
  if (!patient) throw notFound('Patient not found');
  assertLocationAccess(auth, patient.pharmacyId);
  return patient;
}

export async function addAllergy(auth: AuthContext, patientId: string, input: AllergyInput) {
  await assertPatientWritable(auth, patientId);
  return prisma.allergy.create({
    data: {
      patientId,
      substance: input.substance,
      reaction: input.reaction ?? null,
      severity: input.severity ?? 'MODERATE',
    },
  });
}

export async function removeAllergy(auth: AuthContext, patientId: string, allergyId: string) {
  await assertPatientWritable(auth, patientId);
  const allergy = await prisma.allergy.findUnique({ where: { id: allergyId } });
  if (!allergy || allergy.patientId !== patientId) throw notFound('Allergy not found');
  await prisma.allergy.delete({ where: { id: allergyId } });
}

export async function addCondition(auth: AuthContext, patientId: string, input: ConditionInput) {
  await assertPatientWritable(auth, patientId);
  return prisma.chronicCondition.create({
    data: {
      patientId,
      name: input.name,
      diagnosis: input.diagnosis ?? null,
    },
  });
}

export async function removeCondition(auth: AuthContext, patientId: string, conditionId: string) {
  await assertPatientWritable(auth, patientId);
  const condition = await prisma.chronicCondition.findUnique({ where: { id: conditionId } });
  if (!condition || condition.patientId !== patientId) throw notFound('Condition not found');
  await prisma.chronicCondition.delete({ where: { id: conditionId } });
}

export async function updatePatient(auth: AuthContext, id: string, input: Partial<PatientInput>) {
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) throw notFound('Patient not found');
  assertLocationAccess(auth, existing.pharmacyId);

  const customFields = await mergeCustomFields(
    'PATIENT',
    existing.customFields as Record<string, unknown>,
    input.customFields,
  );

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      gender: input.gender,
      preferredLanguage: input.preferredLanguage,
      healthCardEnc:
        input.healthCard === undefined ? undefined : encryptNullable(input.healthCard),
      insurancePlanEnc:
        input.insurancePlan === undefined ? undefined : encryptNullable(input.insurancePlan),
      phone: input.phone,
      email: input.email,
      addressLine1: input.addressLine1,
      city: input.city,
      postalCode: input.postalCode,
      emergencyContact: input.emergencyContact,
      smsOptIn: input.smsOptIn,
      emailOptIn: input.emailOptIn,
      customFields: customFields as Prisma.InputJsonObject,
    },
    include: { allergies: true, conditions: true },
  });
  return toDto(updated);
}
