import { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './patients.service';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);

const createSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  gender: genderEnum,
  preferredLanguage: z.string().optional(),
  healthCard: z.string().nullable().optional(),
  insurancePlan: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  emergencyContact: z.string().nullable().optional(),
  smsOptIn: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  search: z.string().optional(),
  pharmacyId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const q = listQuerySchema.parse(req.query);
  const result = await service.listPatients(req.auth, {
    search: q.search,
    requestedPharmacyId: q.pharmacyId,
    skip: (q.page - 1) * q.pageSize,
    take: q.pageSize,
  });
  await recordAudit({ action: 'READ', entity: 'Patient', metadata: { list: true, count: result.items.length }, req });
  res.json({ ...result, page: q.page, pageSize: q.pageSize });
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const patient = await service.getPatient(req.auth, req.params.id);
  await recordAudit({ action: 'READ', entity: 'Patient', entityId: patient.id, req });
  res.json(patient);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const input = createSchema.parse(req.body);
  const patient = await service.createPatient(req.auth, input);
  await recordAudit({ action: 'CREATE', entity: 'Patient', entityId: patient.id, req });
  res.status(201).json(patient);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const input = updateSchema.parse(req.body);
  const patient = await service.updatePatient(req.auth, req.params.id, input);
  await recordAudit({ action: 'UPDATE', entity: 'Patient', entityId: patient.id, req });
  res.json(patient);
});
