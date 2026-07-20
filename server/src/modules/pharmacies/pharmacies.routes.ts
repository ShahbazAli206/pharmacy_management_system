import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { isValidAllowList } from '../../utils/ip';

const router = Router();
router.use(authenticate);

/**
 * Location directory — id/name/code/province for every pharmacy. Available to
 * any authenticated user (it is a non-sensitive directory, not patient or
 * financial data) so pickers like inter-pharmacy transfers can list locations
 * without needing the owner-only consolidated dashboard.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.pharmacy.findMany({
      select: { id: true, name: true, code: true, province: true, status: true, allowedIpRanges: true },
      orderBy: { code: 'asc' },
    });
    res.json(rows);
  }),
);

// Role-based IP whitelisting config (spec §13.1) — owner-only, since a
// misconfigured allow-list can lock out an entire location's staff.
router.patch(
  '/:id/ip-allowlist',
  requirePermission(PERMISSIONS.PHARMACY_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { allowedIpRanges } = z
      .object({ allowedIpRanges: z.string().nullable() })
      .parse(req.body);

    if (allowedIpRanges && !isValidAllowList(allowedIpRanges)) {
      throw badRequest('allowedIpRanges must be a comma-separated list of IPv4 addresses/CIDR ranges or IPv6 literals');
    }

    const pharmacy = await prisma.pharmacy.findUnique({ where: { id: req.params.id } });
    if (!pharmacy) throw notFound('Pharmacy not found');

    const updated = await prisma.pharmacy.update({
      where: { id: req.params.id },
      data: { allowedIpRanges: allowedIpRanges || null },
      select: { id: true, name: true, code: true, allowedIpRanges: true },
    });
    await recordAudit({ action: 'UPDATE', entity: 'Pharmacy', entityId: updated.id, metadata: { ipAllowlistChanged: true }, req });
    res.json(updated);
  }),
);

export default router;
