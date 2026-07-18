import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

// Request a signature on a document (stands in for DocuSign/Adobe Sign envelope).
router.post(
  '/',
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = z
      .object({ documentId: z.string().uuid(), signerName: z.string().min(1), signerEmail: z.string().email() })
      .parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
    if (!doc) throw notFound('Document not found');

    const sig = await prisma.signatureRequest.create({
      data: { documentId: input.documentId, signerName: input.signerName, signerEmail: input.signerEmail },
    });
    await recordAudit({ action: 'CREATE', entity: 'SignatureRequest', entityId: sig.id, req });
    res.status(201).json(sig);
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  asyncHandler(async (req, res) => {
    const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : undefined;
    res.json(
      await prisma.signatureRequest.findMany({
        where: documentId ? { documentId } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }),
);

// Capture a signature (data URL) and mark signed/declined.
router.post(
  '/:id/sign',
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = z
      .object({ decision: z.enum(['SIGNED', 'DECLINED']), signatureData: z.string().optional() })
      .parse(req.body);
    const sig = await prisma.signatureRequest.findUnique({ where: { id: req.params.id } });
    if (!sig) throw notFound('Signature request not found');
    if (sig.status !== 'PENDING') throw badRequest(`Already ${sig.status}`);

    const updated = await prisma.signatureRequest.update({
      where: { id: req.params.id },
      data: {
        status: input.decision,
        signatureData: input.decision === 'SIGNED' ? input.signatureData ?? null : null,
        signedAt: input.decision === 'SIGNED' ? new Date() : null,
      },
    });
    await recordAudit({ action: 'UPDATE', entity: 'SignatureRequest', entityId: updated.id, metadata: { decision: input.decision }, req });
    res.json(updated);
  }),
);

export default router;
