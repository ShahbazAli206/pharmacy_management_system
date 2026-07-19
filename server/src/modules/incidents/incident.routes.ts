import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from './incident.service';

const router = Router();
router.use(authenticate);

const CATEGORIES = ['MEDICATION_ERROR', 'WORKPLACE_SAFETY', 'THEFT_SECURITY', 'PATIENT_COMPLAINT', 'EQUIPMENT_FAILURE', 'OTHER'] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const createSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES).optional(),
  occurredAt: z.string(),
  location: z.string().optional(),
  description: z.string().min(1),
});

// File a report — self-service, no team-view permission needed (mirrors attendance clock-in).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);
    const incident = await service.reportIncident(req.auth, input);
    await recordAudit({ action: 'CREATE', entity: 'IncidentReport', entityId: incident.id, req });
    res.status(201).json(incident);
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await service.myIncidents(req.auth));
  }),
);

router.get(
  '/',
  requirePermission(PERMISSIONS.INCIDENT_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await service.listIncidents(req.auth, pharmacyId, status));
  }),
);

const updateSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  location: z.string().optional(),
  description: z.string().min(1).optional(),
  actionTaken: z.string().optional(),
});

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INCIDENT_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateSchema.parse(req.body);
    const incident = await service.updateIncident(req.auth, req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'IncidentReport', entityId: incident.id, req });
    res.json(incident);
  }),
);

const resolveSchema = z.object({ actionTaken: z.string().optional() });

router.post(
  '/:id/resolve',
  requirePermission(PERMISSIONS.INCIDENT_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { actionTaken } = resolveSchema.parse(req.body ?? {});
    const incident = await service.resolveIncident(req.auth, req.params.id, actionTaken);
    await recordAudit({ action: 'UPDATE', entity: 'IncidentReport', entityId: incident.id, req });
    res.json(incident);
  }),
);

router.post(
  '/:id/close',
  requirePermission(PERMISSIONS.INCIDENT_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const incident = await service.closeIncident(req.auth, req.params.id);
    await recordAudit({ action: 'UPDATE', entity: 'IncidentReport', entityId: incident.id, req });
    res.json(incident);
  }),
);

export default router;
