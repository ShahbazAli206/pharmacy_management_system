import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './transfers.service';

const router = Router();
router.use(authenticate);

const requestSchema = z.object({
  fromPharmacyId: z.string().uuid().optional(),
  toPharmacyId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

// List transfers touching the caller's location (owner: all, optional filter).
router.get(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.listTransfers(req.auth, pharmacyId));
  }),
);

// Request a transfer out of a location (stock moves only on approval).
router.post(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = requestSchema.parse(req.body);
    const transfer = await service.requestTransfer(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'StockTransfer', entityId: transfer.id, req });
    res.status(201).json(transfer);
  }),
);

// Owner approval — moves stock between locations.
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.PHARMACY_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const transfer = await service.approveTransfer(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'StockTransfer', entityId: transfer.id, metadata: { decision: 'APPROVED' }, req });
    res.json(transfer);
  }),
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.PHARMACY_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const transfer = await service.rejectTransfer(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'StockTransfer', entityId: transfer.id, metadata: { decision: 'REJECTED' }, req });
    res.json(transfer);
  }),
);

// Requester cancels their own pending request.
router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const transfer = await service.cancelTransfer(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'StockTransfer', entityId: transfer.id, metadata: { decision: 'CANCELLED' }, req });
    res.json(transfer);
  }),
);

export default router;
