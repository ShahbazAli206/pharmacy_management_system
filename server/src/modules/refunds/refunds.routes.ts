import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './refunds.service';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(1),
  lines: z.array(z.object({ saleLineId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
});

// Request a refund/return. Amounts at/below the configured threshold
// (settings.refundApprovalThresholdCents) complete immediately, including
// the stock reversal for OTC lines; amounts above it wait for a decision.
router.post(
  '/',
  requirePermission(PERMISSIONS.POS_SELL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const refund = await service.createRefund(req.auth, input);
    await recordAudit({
      action: 'CREATE',
      entity: 'Refund',
      entityId: refund.id,
      metadata: { amountCents: refund.amountCents, status: refund.status },
      req,
    });
    res.status(201).json(refund);
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.POS_SELL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as never) : undefined;
    res.json(await service.listRefunds(req.auth, pharmacyId, status));
  }),
);

router.post(
  '/:id/decision',
  requirePermission(PERMISSIONS.REFUND_APPROVE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { decision } = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
    const refund = await service.decideRefund(req.auth, req.params.id, decision);
    await recordAudit({ action: 'UPDATE', entity: 'Refund', entityId: refund.id, metadata: { decision }, req });
    res.json(refund);
  }),
);

export default router;
