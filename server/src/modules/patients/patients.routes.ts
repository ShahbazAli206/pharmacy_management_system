import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import {
  addAllergyHandler,
  addConditionHandler,
  createHandler,
  getHandler,
  listHandler,
  removeAllergyHandler,
  removeConditionHandler,
  updateHandler,
} from './patients.controller';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.PATIENT_READ), listHandler);
router.get('/:id', requirePermission(PERMISSIONS.PATIENT_READ), getHandler);
router.post('/', requirePermission(PERMISSIONS.PATIENT_WRITE), createHandler);
router.patch('/:id', requirePermission(PERMISSIONS.PATIENT_WRITE), updateHandler);

// Allergy / chronic-condition sub-resources (PATIENT_WRITE, location-scoped).
router.post('/:id/allergies', requirePermission(PERMISSIONS.PATIENT_WRITE), addAllergyHandler);
router.delete('/:id/allergies/:allergyId', requirePermission(PERMISSIONS.PATIENT_WRITE), removeAllergyHandler);
router.post('/:id/conditions', requirePermission(PERMISSIONS.PATIENT_WRITE), addConditionHandler);
router.delete('/:id/conditions/:conditionId', requirePermission(PERMISSIONS.PATIENT_WRITE), removeConditionHandler);

export default router;
