import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requireAnyPermission, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';

const router = Router();
router.use(authenticate);

const query = z.object({
  pharmacyId: z.string().uuid().optional(),
  entity: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

// Owner sees all locations (and may filter); partners see only their location.
router.get(
  '/',
  requireAnyPermission(PERMISSIONS.AUDIT_READ_ALL, PERMISSIONS.AUDIT_READ_LOCATION),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const q = query.parse(req.query);

    const pharmacyId = isOwner(req.auth) ? q.pharmacyId : req.auth.locationId ?? '__none__';

    const where = {
      ...(pharmacyId ? { pharmacyId } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: q.action as never } : {}),
    };

    const [total, items] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({ total, items, page: q.page, pageSize: q.pageSize });
  }),
);

export default router;
