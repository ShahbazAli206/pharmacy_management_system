import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { createHandler, getHandler, listHandler, updateHandler } from './patients.controller';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.PATIENT_READ), listHandler);
router.get('/:id', requirePermission(PERMISSIONS.PATIENT_READ), getHandler);
router.post('/', requirePermission(PERMISSIONS.PATIENT_WRITE), createHandler);
router.patch('/:id', requirePermission(PERMISSIONS.PATIENT_WRITE), updateHandler);

export default router;
