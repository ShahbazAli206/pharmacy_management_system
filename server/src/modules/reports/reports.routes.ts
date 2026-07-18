import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { runReport } from './reports.service';

const router = Router();
router.use(authenticate);

const runSchema = z.object({
  type: z.enum(['SALES_BY_DAY', 'EXPENSES_BY_CATEGORY', 'RX_VOLUME', 'SALES_FORECAST']),
  params: z
    .object({ pharmacyId: z.string().uuid().optional(), from: z.string().optional(), to: z.string().optional() })
    .default({}),
});

router.post(
  '/run',
  requirePermission(PERMISSIONS.REPORT_RUN),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { type, params } = runSchema.parse(req.body);
    res.json(await runReport(req.auth, type, params));
  }),
);

// Saved / custom reports.
router.get(
  '/saved',
  requirePermission(PERMISSIONS.REPORT_RUN),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await prisma.savedReport.findMany({ where: { ownerUserId: req.auth.userId }, orderBy: { createdAt: 'desc' } }));
  }),
);

router.post(
  '/saved',
  requirePermission(PERMISSIONS.REPORT_RUN),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = z
      .object({ name: z.string().min(1), type: z.string().min(1), paramsJson: z.string().default('{}'), pharmacyId: z.string().uuid().optional() })
      .parse(req.body);
    const report = await prisma.savedReport.create({
      data: {
        name: input.name,
        type: input.type,
        paramsJson: input.paramsJson,
        pharmacyId: input.pharmacyId ?? null,
        ownerUserId: req.auth.userId,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'SavedReport', entityId: report.id, req });
    res.status(201).json(report);
  }),
);

export default router;
