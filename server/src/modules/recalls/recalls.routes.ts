import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './recalls.service';
import { runRecallPollJob } from '../../jobs/recallPoll';

const router = Router();
router.use(authenticate);

const ingestSchema = z.object({
  recallNumber: z.string().min(1),
  din: z.string().optional(),
  productName: z.string().min(1),
  reason: z.string().min(1),
  risk: z.enum(['TYPE_I', 'TYPE_II', 'TYPE_III']),
  publishedAt: z.string().optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.RECALL_READ),
  asyncHandler(async (_req, res) => {
    res.json(await service.listRecalls());
  }),
);

router.get(
  '/quarantines',
  requirePermission(PERMISSIONS.RECALL_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.listQuarantines(req.auth, pharmacyId));
  }),
);

// Ingest a recall (stands in for the MedEffect feed) + auto-match to inventory.
router.post(
  '/ingest',
  requirePermission(PERMISSIONS.RECALL_MANAGE),
  asyncHandler(async (req, res) => {
    const input = ingestSchema.parse(req.body);
    const result = await service.ingestRecall(input);
    await recordAudit({
      action: 'CREATE',
      entity: 'DrugRecall',
      entityId: result.recall.id,
      metadata: { locationsAffected: result.locationsAffected },
      req,
    });
    res.status(201).json(result);
  }),
);

// Manual trigger for the real Health Canada recall-feed poll (owner/RECALL_MANAGE)
// — the scheduler runs this automatically every 2 hours; exposed for testing.
router.post(
  '/poll',
  requirePermission(PERMISSIONS.RECALL_MANAGE),
  asyncHandler(async (req, res) => {
    const result = await runRecallPollJob();
    await recordAudit({ action: 'CREATE', entity: 'RecallFeedPoll', metadata: result, req });
    res.status(201).json(result);
  }),
);

// Manual trigger for the recall-notification SLA sweep (owner/RECALL_MANAGE) —
// the scheduler runs this automatically every 5 minutes; exposed for testing.
router.post(
  '/notifications/escalate',
  requirePermission(PERMISSIONS.RECALL_MANAGE),
  asyncHandler(async (_req, res) => {
    res.json(await service.runRecallNotificationEscalation());
  }),
);

router.post(
  '/quarantines/:id/status',
  requirePermission(PERMISSIONS.RECALL_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { status } = z.object({ status: z.enum(['CLEARED', 'DESTROYED']) }).parse(req.body);
    const record = await service.updateQuarantine(req.auth, req.params.id, status);
    await recordAudit({ action: 'UPDATE', entity: 'QuarantineRecord', entityId: record.id, req });
    res.json(record);
  }),
);

export default router;
