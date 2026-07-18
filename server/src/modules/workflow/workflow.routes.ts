import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, forbidden, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

/**
 * Generic approval workflow engine: any sensitive change (inter-pharmacy
 * transfer, patient merge, large refund, ...) can raise a WorkflowRequest and
 * be approved/rejected by an authorized user. Complements the built-in expense
 * approval with a reusable primitive.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = z
      .object({
        pharmacyId: z.string().uuid().optional(),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
        action: z.string().min(1),
        reason: z.string().optional(),
      })
      .parse(req.body);
    const pharmacyId = isOwner(req.auth) ? input.pharmacyId : req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    assertLocationAccess(req.auth, pharmacyId);

    const request = await prisma.workflowRequest.create({
      data: {
        pharmacyId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        reason: input.reason ?? null,
        requestedByUserId: req.auth.userId,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'WorkflowRequest', entityId: request.id, req });
    res.status(201).json(request);
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.WORKFLOW_APPROVE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = isOwner(req.auth)
      ? (typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined)
      : req.auth.locationId ?? undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
    res.json(
      await prisma.workflowRequest.findMany({
        where: { ...(pharmacyId ? { pharmacyId } : {}), status: status as never },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }),
);

router.post(
  '/:id/decision',
  requirePermission(PERMISSIONS.WORKFLOW_APPROVE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { decision, reason } = z
      .object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().optional() })
      .parse(req.body);
    const request = await prisma.workflowRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound('Workflow request not found');
    assertLocationAccess(req.auth, request.pharmacyId);
    if (request.status !== 'PENDING') throw badRequest(`Already ${request.status}`);
    if (request.requestedByUserId === req.auth.userId) throw forbidden('Cannot approve your own request');

    const updated = await prisma.workflowRequest.update({
      where: { id: req.params.id },
      data: { status: decision, decidedByUserId: req.auth.userId, decidedAt: new Date(), reason: reason ?? request.reason },
    });
    await recordAudit({ action: 'UPDATE', entity: 'WorkflowRequest', entityId: updated.id, metadata: { decision }, req });
    res.json(updated);
  }),
);

export default router;
