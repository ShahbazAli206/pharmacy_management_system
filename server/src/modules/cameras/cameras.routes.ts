import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

const router = Router();
router.use(authenticate);

const cameraSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  label: z.string().min(1),
  placement: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  ipAddress: z.string().min(1),
  streamUrl: z.string().optional(),
});

// List cameras: owner sees all (or filters), others see their location only.
router.get(
  '/',
  requirePermission(PERMISSIONS.CAMERA_VIEW),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const requested = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const pharmacyId = isOwner(req.auth) ? requested : req.auth.locationId;
    const cameras = await prisma.camera.findMany({
      where: pharmacyId ? { pharmacyId } : {},
      include: { pharmacy: { select: { name: true, code: true } } },
      orderBy: [{ pharmacyId: 'asc' }, { label: 'asc' }],
    });
    // Footage viewing is a PIPEDA-logged access event.
    await recordAudit({ action: 'READ', entity: 'Camera', metadata: { count: cameras.length }, req });
    res.json(cameras);
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CAMERA_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = cameraSchema.parse(req.body);
    const pharmacyId = isOwner(req.auth) ? input.pharmacyId : req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    assertLocationAccess(req.auth, pharmacyId);
    const camera = await prisma.camera.create({
      data: {
        pharmacyId,
        label: input.label,
        placement: input.placement,
        brand: input.brand ?? null,
        model: input.model ?? null,
        ipAddress: input.ipAddress,
        streamUrl: input.streamUrl ?? null,
      },
    });
    await recordAudit({ action: 'CREATE', entity: 'Camera', entityId: camera.id, req });
    res.status(201).json(camera);
  }),
);

// Health-check ping: cameras (or an NVR agent) report liveness here.
router.post(
  '/:id/heartbeat',
  requirePermission(PERMISSIONS.CAMERA_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { status } = z.object({ status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']) }).parse(req.body);
    const camera = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!camera) throw notFound('Camera not found');
    assertLocationAccess(req.auth, camera.pharmacyId);
    res.json(
      await prisma.camera.update({
        where: { id: req.params.id },
        data: { status, lastSeenAt: status === 'ONLINE' ? new Date() : camera.lastSeenAt },
      }),
    );
  }),
);

export default router;
