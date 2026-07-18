import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  collegeRegNumber: z.string().min(1),
  phone: z.string().optional(),
  fax: z.string().optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.PRESCRIPTION_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const requested = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const pharmacyId = isOwner(req.auth) ? requested : req.auth.locationId;
    const prescribers = await prisma.prescriber.findMany({
      where: pharmacyId ? { pharmacyId } : {},
      orderBy: { lastName: 'asc' },
    });
    res.json(prescribers);
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PRESCRIBER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const pharmacyId = isOwner(req.auth) ? input.pharmacyId : req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    assertLocationAccess(req.auth, pharmacyId);

    const prescriber = await prisma.prescriber.create({
      data: {
        pharmacyId,
        firstName: input.firstName,
        lastName: input.lastName,
        collegeRegNumber: input.collegeRegNumber,
        phone: input.phone ?? null,
        fax: input.fax ?? null,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'Prescriber', entityId: prescriber.id, req });
    res.status(201).json(prescriber);
  }),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.PRESCRIPTION_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const prescriber = await prisma.prescriber.findUnique({ where: { id: req.params.id } });
    if (!prescriber) throw notFound('Prescriber not found');
    assertLocationAccess(req.auth, prescriber.pharmacyId);
    res.json(prescriber);
  }),
);

export default router;
