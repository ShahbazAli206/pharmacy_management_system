import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { getOcrProvider } from '../../services/ocr';
import * as service from './prescriptions.service';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  patientId: z.string().uuid(),
  prescriberId: z.string().uuid(),
  productId: z.string().uuid(),
  directions: z.string().min(1),
  quantity: z.number().int().positive(),
  refillsAuthorized: z.number().int().min(0).optional(),
  scannedImagePath: z.string().optional(),
  acknowledgeAlerts: z.boolean().optional(),
});

const checkSchema = z.object({
  patientId: z.string().uuid(),
  productId: z.string().uuid(),
});

const dispenseSchema = z.object({
  quantity: z.number().int().positive().optional(),
  counsellingNotes: z.string().optional(),
  // Present when this dispense was queued offline and is now being synced —
  // see prescriptions.service.ts dispense() for the idempotent-replay logic.
  idempotencyKey: z.string().uuid().optional(),
});

// On-demand interaction check (used by the entry form before saving).
router.post(
  '/interaction-check',
  requirePermission(PERMISSIONS.PRESCRIPTION_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { patientId, productId } = checkSchema.parse(req.body);
    res.json({ alerts: await service.runInteractionCheck(req.auth, patientId, productId) });
  }),
);

// OCR pre-fill (pharmacist must still confirm every field).
router.post(
  '/ocr',
  requirePermission(PERMISSIONS.PRESCRIPTION_WRITE),
  asyncHandler(async (req, res) => {
    const { imageBase64 } = z.object({ imageBase64: z.string().min(1) }).parse(req.body);
    const buffer = Buffer.from(imageBase64, 'base64');
    const parsed = await getOcrProvider().parsePrescription(buffer);
    res.json(parsed);
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.PRESCRIPTION_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    res.json(await service.listPrescriptions(req.auth, { patientId, requestedPharmacyId: pharmacyId }));
  }),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.PRESCRIPTION_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.getPrescription(req.auth, req.params.id));
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PRESCRIPTION_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const result = await service.createPrescription(req.auth, input);
    if (result.status === 'BLOCKED') {
      // 409: interaction alerts must be acknowledged before saving.
      res.status(409).json({ requiresAcknowledgement: true, alerts: result.alerts });
      return;
    }
    await recordAudit({
      action: 'CREATE',
      entity: 'Prescription',
      entityId: (result.prescription as { id: string }).id,
      metadata: { alerts: result.alerts.length },
      req,
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/:id/dispense',
  requirePermission(PERMISSIONS.PRESCRIPTION_DISPENSE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = dispenseSchema.parse(req.body);
    const result = await service.dispense(req.auth, req.params.id, input);
    await recordAudit({
      action: 'CREATE',
      entity: 'DispensingRecord',
      entityId: result.record.id,
      // Controlled-substance dispensing is flagged for the separate audit
      // trail; an idempotent-replay from an offline sync retry is flagged too
      // so it doesn't read as a second, real dispense in the audit trail.
      metadata: { prescriptionId: req.params.id, controlled: result.isControlled, replayed: 'replayed' in result && result.replayed },
      req,
    });
    res.status(201).json(result);
  }),
);

export default router;
