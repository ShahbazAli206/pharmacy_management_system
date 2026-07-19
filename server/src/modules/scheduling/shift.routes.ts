import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './shift.service';

const router = Router();
router.use(authenticate);

const pharmacyQ = (v: unknown) => (typeof v === 'string' ? v : undefined);
const dateQ = (v: unknown) => (typeof v === 'string' ? new Date(v) : undefined);

// The caller's own upcoming shifts — open to any authenticated user, no team-view permission needed.
router.get(
  '/shifts/me',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.myShifts(req.auth));
  }),
);

router.get(
  '/shifts',
  requirePermission(PERMISSIONS.SHIFT_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const rows = await service.listShifts(
      req.auth,
      pharmacyQ(req.query.pharmacyId),
      dateQ(req.query.from),
      dateQ(req.query.to),
    );
    res.json(rows);
  }),
);

const createSchema = z.object({
  userId: z.string().uuid(),
  pharmacyId: z.string().uuid().optional(),
  startAt: z.string(),
  endAt: z.string(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  '/shifts',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const shift = await service.createShift(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'Shift', entityId: shift.id, req });
    res.status(201).json(shift);
  }),
);

const updateSchema = z.object({
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

router.patch(
  '/shifts/:id',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateSchema.parse(req.body);
    const shift = await service.updateShift(req.auth, req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'Shift', entityId: shift.id, req });
    res.json(shift);
  }),
);

router.post(
  '/shifts/:id/publish',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const shift = await service.publishShift(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'Shift', entityId: shift.id, req });
    res.json(shift);
  }),
);

router.post(
  '/shifts/:id/cancel',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const shift = await service.cancelShift(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'Shift', entityId: shift.id, req });
    res.json(shift);
  }),
);

export default router;
