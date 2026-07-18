import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './compliance.service';

const router = Router();
router.use(authenticate);

const pharmacyQ = (v: unknown) => (typeof v === 'string' ? v : undefined);

router.get(
  '/checklist',
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const date = typeof req.query.date === 'string' ? new Date(req.query.date) : new Date();
    res.json(await service.listChecklist(req.auth, pharmacyQ(req.query.pharmacyId), date));
  }),
);

router.post(
  '/checklist/generate',
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const date = typeof req.body.date === 'string' ? new Date(req.body.date) : new Date();
    res.status(201).json(await service.generateChecklist(req.auth, pharmacyQ(req.body.pharmacyId), date));
  }),
);

const completeSchema = z.object({ signature: z.string().optional(), notes: z.string().optional() });

router.post(
  '/checklist/:id/complete',
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = completeSchema.parse(req.body);
    const record = await service.completeTask(req.auth, req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'ComplianceRecord', entityId: record.id, req });
    res.json(record);
  }),
);

router.post(
  '/escalate',
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.runEscalation(req.auth, pharmacyQ(req.body.pharmacyId)));
  }),
);

router.get(
  '/score',
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.complianceScore(req.auth, pharmacyQ(req.query.pharmacyId)));
  }),
);

router.get(
  '/alerts',
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.listAlerts(req.auth, pharmacyQ(req.query.pharmacyId)));
  }),
);

router.post(
  '/alerts/:id/resolve',
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const alert = await service.resolveAlert(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'ComplianceAlert', entityId: alert.id, req });
    res.json(alert);
  }),
);

router.get(
  '/license-expiry',
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.licenseExpiryWarnings(req.auth, pharmacyQ(req.query.pharmacyId)));
  }),
);

export default router;
