import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler } from '../../utils/httpError';

const router = Router();

const startedAt = Date.now();

// Public liveness (no auth) — for load balancers / uptime checks.
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'healthy' : 'degraded', db });
  }),
);

// Detailed health + platform metrics (owner/monitoring only).
router.get(
  '/health',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_MONITOR),
  asyncHandler(async (_req, res) => {
    const [pharmacies, users, patients, prescriptions, sales, openAlerts, pendingNotifications] =
      await prisma.$transaction([
        prisma.pharmacy.count(),
        prisma.user.count(),
        prisma.patient.count(),
        prisma.prescription.count(),
        prisma.sale.count(),
        prisma.complianceAlert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
        prisma.notification.count({ where: { status: 'PENDING' } }),
      ]);

    res.json({
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      nodeVersion: process.version,
      counts: { pharmacies, users, patients, prescriptions, sales },
      operational: { openComplianceAlerts: openAlerts, pendingNotifications },
    });
  }),
);

export default router;
