import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './narcotics.service';

const router = Router();
router.use(authenticate);

const q = (v: unknown) => (typeof v === 'string' ? v : undefined);

const TXN_TYPES = ['RECEIPT', 'DISPENSE', 'ADJUSTMENT', 'COUNT_ADJUSTMENT', 'DESTRUCTION', 'TRANSFER'] as const;

const txnSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  type: z.enum(TXN_TYPES),
  quantityChange: z.number().int(),
  notes: z.string().optional(),
});

const countSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  period: z.enum(['MORNING', 'CLOSING', 'SPOT']),
  countedQuantity: z.number().int().min(0),
  notes: z.string().optional(),
});

router.get(
  '/register',
  requirePermission(PERMISSIONS.NARCOTICS_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.getRegister(req.auth, q(req.query.pharmacyId), q(req.query.productId)));
  }),
);

router.post(
  '/register',
  requirePermission(PERMISSIONS.NARCOTICS_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = txnSchema.parse(req.body);
    const txn = await service.recordTxn(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'NarcoticTxn', entityId: txn.id, req });
    res.status(201).json(txn);
  }),
);

router.post(
  '/count',
  requirePermission(PERMISSIONS.NARCOTICS_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = countSchema.parse(req.body);
    const count = await service.recordCount(req.auth, input);
    await recordAudit({
      action: 'CREATE',
      entity: 'NarcoticCount',
      entityId: count.id,
      metadata: { discrepancy: count.discrepancy },
      req,
    });
    res.status(201).json(count);
  }),
);

router.post(
  '/count/:id/resolve',
  requirePermission(PERMISSIONS.NARCOTICS_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const result = await service.resolveCount(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'NarcoticCount', entityId: req.params.id, req });
    res.json(result);
  }),
);

export default router;
