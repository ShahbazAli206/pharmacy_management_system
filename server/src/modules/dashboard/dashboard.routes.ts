import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import * as service from './dashboard.service';

const router = Router();
router.use(authenticate);

const locationQuery = z.object({ pharmacyId: z.string().uuid().optional() });

// Owner consolidated overview.
router.get(
  '/owner',
  requirePermission(PERMISSIONS.DASHBOARD_OWNER),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.ownerOverview(req.auth));
  }),
);

// Partner/location dashboard (owner may pass ?pharmacyId to inspect one).
router.get(
  '/location',
  requirePermission(PERMISSIONS.DASHBOARD_LOCATION),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { pharmacyId } = locationQuery.parse(req.query);
    res.json(await service.locationOverview(req.auth, pharmacyId));
  }),
);

export default router;
