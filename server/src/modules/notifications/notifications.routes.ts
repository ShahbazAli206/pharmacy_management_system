import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './notifications.service';

const router = Router();
router.use(authenticate);

const s = (v: unknown) => (typeof v === 'string' ? v : undefined);

router.get(
  '/',
  requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.listNotifications(req.auth, s(req.query.pharmacyId)));
  }),
);

router.post(
  '/refill-reminders/generate',
  requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const result = await service.generateRefillReminders(req.auth, s(req.body.pharmacyId));
    await recordAudit({ action: 'CREATE', entity: 'Notification', metadata: result, req });
    res.status(201).json(result);
  }),
);

router.post(
  '/dispatch',
  requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.dispatchPending(req.auth, s(req.body.pharmacyId)));
  }),
);

export default router;
