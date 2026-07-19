import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import * as service from '../../services/customFields';

const router = Router();
router.use(authenticate);

const ENTITY_TYPES = ['PATIENT'] as const;
const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const;

// Definitions are metadata, not sensitive data — any authenticated user can
// read them (needed to render the relevant entity's form); only an owner can
// create/edit them (system-wide, not per-location).
router.get(
  '/definitions',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { entityType } = z.object({ entityType: z.enum(ENTITY_TYPES) }).parse(req.query);
    res.json(await service.listDefinitions(entityType));
  }),
);

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  fieldType: z.enum(FIELD_TYPES).optional(),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post(
  '/definitions',
  requirePermission(PERMISSIONS.CUSTOM_FIELD_MANAGE),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const def = await service.createDefinition(input);
    await recordAudit({ action: 'CREATE', entity: 'CustomFieldDefinition', entityId: def.id, req });
    res.status(201).json(def);
  }),
);

const updateSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.patch(
  '/definitions/:id',
  requirePermission(PERMISSIONS.CUSTOM_FIELD_MANAGE),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    if (Object.keys(input).length === 0) throw badRequest('No fields to update');
    const def = await service.updateDefinition(req.params.id, input);
    await recordAudit({ action: 'UPDATE', entity: 'CustomFieldDefinition', entityId: def.id, req });
    res.json(def);
  }),
);

export default router;
