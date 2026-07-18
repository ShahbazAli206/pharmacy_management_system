import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './inventory.service';

const router = Router();
router.use(authenticate);

const pharmacyQuery = z.object({ pharmacyId: z.string().uuid().optional() });

const receiveSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  unitCostCents: z.number().int().min(0).optional(),
  supplierId: z.string().uuid().optional(),
  reorderThreshold: z.number().int().min(0).optional(),
  reorderQuantity: z.number().int().min(0).optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { pharmacyId } = pharmacyQuery.parse(req.query);
    res.json(await service.listInventory(req.auth, pharmacyId));
  }),
);

router.get(
  '/alerts/expiry',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { pharmacyId } = pharmacyQuery.parse(req.query);
    res.json(await service.expiryAlerts(req.auth, pharmacyId));
  }),
);

router.get(
  '/alerts/low-stock',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { pharmacyId } = pharmacyQuery.parse(req.query);
    res.json(await service.lowStock(req.auth, pharmacyId));
  }),
);

router.post(
  '/receive',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = receiveSchema.parse(req.body);
    const result = await service.receiveStock(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'StockLot', entityId: result.lot.id, req });
    res.status(201).json(result);
  }),
);

router.post(
  '/reorder/auto',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { pharmacyId } = pharmacyQuery.parse(req.body);
    const pos = await service.generateReorderPOs(req.auth, pharmacyId);
    await recordAudit({ action: 'CREATE', entity: 'PurchaseOrder', metadata: { count: pos.length, auto: true }, req });
    res.status(201).json({ created: pos.length, purchaseOrders: pos });
  }),
);

export default router;
