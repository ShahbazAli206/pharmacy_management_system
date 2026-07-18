import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { getStorage, makeKey } from '../../services/storage';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const requested = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const pharmacyId = isOwner(req.auth) ? requested : req.auth.locationId;
    const docs = await prisma.document.findMany({
      where: pharmacyId ? { pharmacyId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(docs);
  }),
);

const uploadSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  name: z.string().min(1),
  category: z.enum(['POLICY', 'LEASE', 'LICENSE', 'INVOICE', 'CONSENT', 'OTHER']),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

router.post(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = uploadSchema.parse(req.body);
    const pharmacyId = isOwner(req.auth) ? input.pharmacyId ?? null : req.auth.locationId;
    if (pharmacyId) assertLocationAccess(req.auth, pharmacyId);

    const buffer = Buffer.from(input.contentBase64, 'base64');
    if (buffer.byteLength === 0) throw badRequest('Empty file');
    const stored = await getStorage().put(makeKey('documents', input.name), buffer);

    const doc = await prisma.document.create({
      data: {
        pharmacyId,
        name: input.name,
        category: input.category,
        storagePath: stored.path,
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedByUserId: req.auth.userId,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'Document', entityId: doc.id, req });
    res.status(201).json(doc);
  }),
);

export default router;
