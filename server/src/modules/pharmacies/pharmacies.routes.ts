import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/httpError';

const router = Router();
router.use(authenticate);

/**
 * Location directory — id/name/code/province for every pharmacy. Available to
 * any authenticated user (it is a non-sensitive directory, not patient or
 * financial data) so pickers like inter-pharmacy transfers can list locations
 * without needing the owner-only consolidated dashboard.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.pharmacy.findMany({
      select: { id: true, name: true, code: true, province: true, status: true },
      orderBy: { code: 'asc' },
    });
    res.json(rows);
  }),
);

export default router;
