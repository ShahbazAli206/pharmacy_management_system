import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

/**
 * Effective feature flags for a pharmacy = global defaults (pharmacyId null)
 * overridden by any per-pharmacy row. Lets modules be enabled per location
 * without redeploying (spec requirement).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = isOwner(req.auth)
      ? (typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : null)
      : req.auth.locationId;

    const flags = await prisma.featureFlag.findMany({
      where: { OR: [{ pharmacyId: null }, ...(pharmacyId ? [{ pharmacyId }] : [])] },
    });

    const effective: Record<string, boolean> = {};
    for (const f of flags.filter((f) => f.pharmacyId === null)) effective[f.key] = f.enabled;
    for (const f of flags.filter((f) => f.pharmacyId === pharmacyId)) effective[f.key] = f.enabled;
    res.json({ pharmacyId, flags: effective });
  }),
);

const upsertSchema = z.object({
  key: z.string().min(1),
  pharmacyId: z.string().uuid().nullable().optional(),
  enabled: z.boolean(),
  description: z.string().optional(),
});

// Toggle a flag (owner-only) — global or per-pharmacy override.
router.put(
  '/',
  requirePermission(PERMISSIONS.FEATURE_FLAG_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = upsertSchema.parse(req.body);
    const pharmacyId = input.pharmacyId ?? null;
    // A null pharmacyId (global flag) can't be used in Prisma's compound-unique
    // upsert, so find-then-update/create explicitly.
    const existing = await prisma.featureFlag.findFirst({ where: { key: input.key, pharmacyId } });
    const flag = existing
      ? await prisma.featureFlag.update({
          where: { id: existing.id },
          data: { enabled: input.enabled, description: input.description ?? existing.description },
        })
      : await prisma.featureFlag.create({
          data: { key: input.key, pharmacyId, enabled: input.enabled, description: input.description ?? null },
        });
    await recordAudit({ action: 'UPDATE', entity: 'FeatureFlag', entityId: flag.id, metadata: { key: input.key, enabled: input.enabled }, req });
    res.json(flag);
  }),
);

export default router;
