import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, unauthorized } from '../../utils/httpError';

const router = Router();
router.use(authenticate);

/**
 * Global search across patients, prescriptions, and products. Results are
 * location-scoped for non-owners; each category is only searched if the caller
 * holds the relevant read permission.
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.SEARCH_GLOBAL),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
    const auth = req.auth;
    const locFilter = isOwner(auth) ? {} : { pharmacyId: auth.locationId ?? '__none__' };
    const insensitive = 'insensitive' as const;

    const [patients, prescriptions, products] = await Promise.all([
      auth.permissions.has(PERMISSIONS.PATIENT_READ)
        ? prisma.patient.findMany({
            where: {
              ...locFilter,
              OR: [
                { firstName: { contains: q, mode: insensitive } },
                { lastName: { contains: q, mode: insensitive } },
              ],
            },
            select: { id: true, firstName: true, lastName: true, pharmacyId: true },
            take: 10,
          })
        : Promise.resolve([]),
      auth.permissions.has(PERMISSIONS.PRESCRIPTION_READ)
        ? prisma.prescription.findMany({
            where: { ...locFilter, drugName: { contains: q, mode: insensitive } },
            select: { id: true, drugName: true, strength: true, patientId: true },
            take: 10,
          })
        : Promise.resolve([]),
      auth.permissions.has(PERMISSIONS.INVENTORY_READ) || auth.permissions.has(PERMISSIONS.PRESCRIPTION_READ)
        ? prisma.product.findMany({
            where: { OR: [{ name: { contains: q, mode: insensitive } }, { din: { contains: q } }] },
            select: { id: true, name: true, din: true, strength: true },
            take: 10,
          })
        : Promise.resolve([]),
    ]);

    res.json({
      query: q,
      results: {
        patients: patients.map((p) => ({ type: 'patient', id: p.id, label: `${p.lastName}, ${p.firstName}` })),
        prescriptions: prescriptions.map((r) => ({ type: 'prescription', id: r.id, label: `${r.drugName} ${r.strength}` })),
        products: products.map((p) => ({ type: 'product', id: p.id, label: `${p.name} ${p.strength} (${p.din})` })),
      },
    });
  }),
);

export default router;
