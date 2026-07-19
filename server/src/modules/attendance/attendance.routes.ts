import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

// Clock in — one open record per user at their location.
router.post(
  '/clock-in',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (!req.auth.locationId) throw badRequest('Only location staff can clock in');
    const open = await prisma.attendance.findFirst({
      where: { userId: req.auth.userId, clockOutAt: null },
    });
    if (open) throw badRequest('Already clocked in');
    const rec = await prisma.attendance.create({
      data: { userId: req.auth.userId, pharmacyId: req.auth.locationId },
    });
    await recordAudit({ action: 'CREATE', entity: 'Attendance', entityId: rec.id, req });
    res.status(201).json(rec);
  }),
);

// Clock out — close the caller's open record.
router.post(
  '/clock-out',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const open = await prisma.attendance.findFirst({
      where: { userId: req.auth.userId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) throw badRequest('Not clocked in');
    const rec = await prisma.attendance.update({
      where: { id: open.id },
      data: { clockOutAt: new Date() },
    });
    await recordAudit({ action: 'UPDATE', entity: 'Attendance', entityId: rec.id, req });
    res.json(rec);
  }),
);

// The caller's own status + recent shifts.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const [open, recent] = await Promise.all([
      prisma.attendance.findFirst({
        where: { userId: req.auth.userId, clockOutAt: null },
        orderBy: { clockInAt: 'desc' },
      }),
      prisma.attendance.findMany({
        where: { userId: req.auth.userId },
        orderBy: { clockInAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({ open, recent });
  }),
);

// Team attendance log (managers). Owner: all or ?pharmacyId; others: own location.
router.get(
  '/',
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const requested = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const pharmacyId = isOwner(req.auth) ? requested : req.auth.locationId ?? '__none__';
    const rows = await prisma.attendance.findMany({
      where: pharmacyId ? { pharmacyId } : {},
      include: {
        user: { select: { firstName: true, lastName: true, role: { select: { name: true } } } },
        pharmacy: { select: { code: true } },
      },
      orderBy: { clockInAt: 'desc' },
      take: 100,
    });
    res.json(rows);
  }),
);

export default router;
