import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './review.service';

const router = Router();
router.use(authenticate);

const RATINGS = ['NEEDS_IMPROVEMENT', 'MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS', 'OUTSTANDING'] as const;

const createSchema = z.object({
  userId: z.string().uuid(),
  pharmacyId: z.string().uuid().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  rating: z.enum(RATINGS),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.string().optional(),
  comments: z.string().optional(),
});

router.post(
  '/',
  requirePermission(PERMISSIONS.REVIEW_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const review = await service.createReview(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'PerformanceReview', entityId: review.id, req });
    res.status(201).json(review);
  }),
);

// The caller's own reviews — self-service, drafts withheld until submitted (service-enforced).
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.myReviews(req.auth));
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.REVIEW_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await service.listReviews(req.auth, pharmacyId, status));
  }),
);

const updateSchema = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  rating: z.enum(RATINGS).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.string().optional(),
  comments: z.string().optional(),
});

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.REVIEW_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateSchema.parse(req.body);
    const review = await service.updateReview(req.auth, req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'PerformanceReview', entityId: review.id, req });
    res.json(review);
  }),
);

router.post(
  '/:id/submit',
  requirePermission(PERMISSIONS.REVIEW_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const review = await service.submitReview(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'PerformanceReview', entityId: review.id, req });
    res.json(review);
  }),
);

// Self-service — the reviewed employee acknowledges, no team-manage permission needed.
router.post(
  '/:id/acknowledge',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const review = await service.acknowledgeReview(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'PerformanceReview', entityId: review.id, req });
    res.json(review);
  }),
);

export default router;
