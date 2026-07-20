import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { getSettings, updateSettings } from '../../services/settings';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

const patchSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(3650).optional(), // enforce >= 10 years
  defaultCurrency: z.string().optional(),
  defaultTimezone: z.string().optional(),
  defaultLocale: z.string().optional(),
  refundApprovalThresholdCents: z.number().int().min(0).optional(),
  craRemitterType: z.enum(['REGULAR', 'QUARTERLY']).optional(),
});

router.put(
  '/',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const patch = patchSchema.parse(req.body);
    const updated = await updateSettings(patch);
    await recordAudit({ action: 'UPDATE', entity: 'SystemSetting', metadata: patch, req });
    res.json(updated);
  }),
);

// ---- Per-user notification preferences ----
router.get(
  '/notification-preferences',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const prefs = await prisma.notificationPreference.findUnique({ where: { userId: req.auth.userId } });
    res.json(prefs ?? { userId: req.auth.userId, sms: true, email: true, push: true, inApp: true });
  }),
);

router.put(
  '/notification-preferences',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = z
      .object({ sms: z.boolean(), email: z.boolean(), push: z.boolean(), inApp: z.boolean() })
      .parse(req.body);
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.auth.userId },
      update: input,
      create: { userId: req.auth.userId, ...input },
    });
    res.json(prefs);
  }),
);

export default router;
