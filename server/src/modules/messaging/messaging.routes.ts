import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

/**
 * Inbox: a user sees broadcasts (pharmacyId null) plus messages for their own
 * location. Owners see everything. Partners get no cross-location leakage —
 * the spec forbids cross-location messaging between partners.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const where = isOwner(req.auth)
      ? {}
      : { OR: [{ pharmacyId: null }, { pharmacyId: req.auth.locationId }] };
    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(messages);
  }),
);

const sendSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  pharmacyId: z.string().uuid().optional(),
});

// Intra-location message.
router.post(
  '/',
  requirePermission(PERMISSIONS.MESSAGE_SEND),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = sendSchema.parse(req.body);
    const pharmacyId = isOwner(req.auth) ? input.pharmacyId : req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    assertLocationAccess(req.auth, pharmacyId);
    const message = await prisma.message.create({
      data: {
        senderUserId: req.auth.userId,
        senderName: `${req.auth.role}`,
        scope: 'LOCATION',
        pharmacyId,
        subject: input.subject ?? null,
        body: input.body,
      },
    });
    res.status(201).json(message);
  }),
);

// Owner broadcast to all locations (or a specific one).
router.post(
  '/broadcast',
  requirePermission(PERMISSIONS.MESSAGE_BROADCAST),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = sendSchema.parse(req.body);
    const message = await prisma.message.create({
      data: {
        senderUserId: req.auth.userId,
        senderName: 'System Owner',
        scope: 'BROADCAST',
        pharmacyId: input.pharmacyId ?? null,
        subject: input.subject ?? null,
        body: input.body,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'Message', entityId: message.id, metadata: { broadcast: true }, req });
    res.status(201).json(message);
  }),
);

export default router;
