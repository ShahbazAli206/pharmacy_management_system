import { Router } from 'express';
import { z } from 'zod';
import { DosageForm, Gender } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, isOwner, assertLocationAccess } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { parseCsv } from '../../utils/csvParse';

const router = Router();
router.use(authenticate);

const FORMS = new Set<string>(['TABLET', 'CAPSULE', 'LIQUID', 'CREAM', 'OINTMENT', 'INJECTION', 'INHALER', 'DROPS', 'PATCH', 'SUPPOSITORY', 'OTHER']);
const GENDERS = new Set<string>(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);

interface RowError {
  row: number;
  error: string;
}

/**
 * Bulk import from CSV. Each row is validated independently; valid rows are
 * created and invalid rows are reported with their line number, so a partial
 * import still succeeds (data-import wizard semantics).
 */
router.post(
  '/:entity',
  requirePermission(PERMISSIONS.DATA_IMPORT),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { csv, pharmacyId: requestedPharmacyId } = z
      .object({ csv: z.string().min(1), pharmacyId: z.string().uuid().optional() })
      .parse(req.body);
    const entity = req.params.entity;
    const rows = parseCsv(csv);
    const errors: RowError[] = [];
    let created = 0;

    if (entity === 'products') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.din || !r.name || !r.strength || !FORMS.has(r.form)) {
          errors.push({ row: i + 2, error: 'Missing din/name/strength or invalid form' });
          continue;
        }
        try {
          await prisma.product.create({
            data: {
              din: r.din,
              name: r.name,
              strength: r.strength,
              form: r.form as DosageForm,
              genericName: r.genericName || null,
              isControlled: r.isControlled === 'true',
              defaultPriceCents: r.defaultPriceCents ? parseInt(r.defaultPriceCents, 10) : 0,
              interactionClasses: r.interactionClasses || '',
            },
          });
          created++;
        } catch {
          errors.push({ row: i + 2, error: `Duplicate or invalid DIN: ${r.din}` });
        }
      }
    } else if (entity === 'patients') {
      const pharmacyId = isOwner(req.auth) ? requestedPharmacyId : req.auth.locationId;
      if (!pharmacyId) throw badRequest('pharmacyId is required for patient import');
      assertLocationAccess(req.auth, pharmacyId);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const dob = new Date(r.dateOfBirth);
        if (!r.firstName || !r.lastName || isNaN(dob.getTime()) || !GENDERS.has(r.gender)) {
          errors.push({ row: i + 2, error: 'Missing name, invalid dateOfBirth, or invalid gender' });
          continue;
        }
        await prisma.patient.create({
          data: {
            pharmacyId,
            firstName: r.firstName,
            lastName: r.lastName,
            dateOfBirth: dob,
            gender: r.gender as Gender,
            phone: r.phone || null,
            email: r.email || null,
          },
        });
        created++;
      }
    } else {
      throw badRequest(`Unsupported import entity: ${entity} (products | patients)`);
    }

    await recordAudit({ action: 'CREATE', entity: `Import:${entity}`, metadata: { created, errors: errors.length }, req });
    res.status(201).json({ entity, total: rows.length, created, failed: errors.length, errors });
  }),
);

export default router;
