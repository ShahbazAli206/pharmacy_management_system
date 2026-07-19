import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './training.service';

const router = Router();
router.use(authenticate);

const CATEGORIES = ['CONTINUING_EDUCATION', 'CERTIFICATION', 'ORIENTATION', 'SAFETY', 'OTHER'] as const;

const logSchema = z.object({
  userId: z.string().uuid().optional(),
  pharmacyId: z.string().uuid().optional(),
  title: z.string().min(1),
  provider: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  creditHours: z.number().nonnegative().optional(),
  completedAt: z.string(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
});

// Log a completed course/certification — self-service by default (mirrors incident filing);
// logging on another staff member's behalf requires training:manage (enforced in the service).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = logSchema.parse(req.body);
    const record = await service.logTraining(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'TrainingRecord', entityId: record.id, req });
    res.status(201).json(record);
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.myTraining(req.auth));
  }),
);

router.get(
  '/expiring',
  requirePermission(PERMISSIONS.TRAINING_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.expiringTraining(req.auth, pharmacyId));
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.TRAINING_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.listTraining(req.auth, pharmacyId));
  }),
);

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  provider: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  creditHours: z.number().nonnegative().optional(),
  completedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
});

// Editing is self-service for the caller's own record; editing someone else's
// requires training:manage (enforced in the service, since ownership is data-dependent).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateSchema.parse(req.body);
    const record = await service.updateTraining(req.auth, req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'TrainingRecord', entityId: record.id, req });
    res.json(record);
  }),
);

export default router;
