import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './sales.service';

const router = Router();
router.use(authenticate);

const lineSchema = z.object({
  itemType: z.enum(['OTC', 'RX', 'COMPOUND', 'SERVICE']),
  description: z.string().min(1),
  productId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().min(0),
  taxable: z.boolean().optional(),
});

const createSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'DEBIT', 'CREDIT', 'INSURANCE']),
  lines: z.array(lineSchema).min(1),
});

router.post(
  '/',
  requirePermission(PERMISSIONS.POS_SELL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const sale = await service.createSale(req.auth, input);
    await recordAudit({
      action: 'CREATE',
      entity: 'Sale',
      entityId: sale.id,
      metadata: { totalCents: sale.totalCents },
      req,
    });
    res.status(201).json(sale);
  }),
);

// Must be registered before GET /:id, or "daily-summary" would be swallowed
// as an :id lookup.
router.get(
  '/daily-summary',
  requirePermission(PERMISSIONS.POS_SELL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.dailySummary(req.auth, pharmacyId));
  }),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.POS_SELL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.getSale(req.auth, req.params.id));
  }),
);

export default router;
