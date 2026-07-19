import { Router } from 'express';
import { z } from 'zod';
import { RoleName } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, requireAnyPermission, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ROLE_PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { code39Svg } from '../../utils/barcode';
import { qrCodeSvg } from '../../utils/qrcode';

const router = Router();
router.use(authenticate);

const ROLE_NAMES: RoleName[] = [
  'SYSTEM_OWNER', 'LOCATION_PARTNER', 'PHARMACIST_IN_CHARGE', 'PHARMACY_TECHNICIAN',
  'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT',
];

/**
 * Role simulator: show the effective permission set for any role (owner-only).
 * Reads the same source of truth as the seed/runtime matrix so testers can
 * verify access without impersonating a user.
 */
router.get(
  '/role-simulator/:role',
  requirePermission(PERMISSIONS.ROLE_SIMULATE),
  asyncHandler(async (req, res) => {
    const role = req.params.role as RoleName;
    if (!ROLE_NAMES.includes(role)) throw badRequest('Unknown role');
    res.json({ role, permissions: ROLE_PERMISSIONS[role] });
  }),
);

/**
 * Activity timeline for a specific entity, drawn from the immutable audit log.
 * Location-scoped for non-owners. Gated behind the same audit-read permissions
 * as the audit-log viewer itself — otherwise any authenticated role (e.g. a
 * cashier) could query audit metadata for entities they have no read access
 * to (e.g. PerformanceReview), even though the query is already location-scoped.
 */
router.get(
  '/timeline',
  requireAnyPermission(PERMISSIONS.AUDIT_READ_ALL, PERMISSIONS.AUDIT_READ_LOCATION),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { entity, entityId } = z
      .object({ entity: z.string().min(1), entityId: z.string().min(1) })
      .parse(req.query);

    const events = await prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
        ...(isOwner(req.auth) ? {} : { pharmacyId: req.auth.locationId ?? '__none__' }),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json(events);
  }),
);

// Barcode (Code39) SVG for a product DIN or arbitrary code — used by labels.
router.get(
  '/barcode',
  asyncHandler(async (req, res) => {
    const { value } = z.object({ value: z.string().min(1).max(40) }).parse(req.query);
    try {
      const svg = code39Svg(value);
      res.header('Content-Type', 'image/svg+xml').send(svg);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  }),
);

// QR code SVG — higher data density than Code39 (e.g. a full URL or JSON payload).
router.get(
  '/qrcode',
  asyncHandler(async (req, res) => {
    const { value } = z.object({ value: z.string().min(1).max(1000) }).parse(req.query);
    try {
      const svg = qrCodeSvg(value);
      res.header('Content-Type', 'image/svg+xml').send(svg);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  }),
);

export default router;
