import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, notFound } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { mergeCustomFields } from '../../services/customFields';

const router = Router();
router.use(authenticate);

const FORMS = [
  'TABLET', 'CAPSULE', 'LIQUID', 'CREAM', 'OINTMENT', 'INJECTION',
  'INHALER', 'DROPS', 'PATCH', 'SUPPOSITORY', 'OTHER',
] as const;
const SCHEDULES = [
  'UNSCHEDULED', 'OTC', 'SCHEDULE_I', 'SCHEDULE_II', 'SCHEDULE_III',
  'NARCOTIC', 'CONTROLLED', 'TARGETED',
] as const;

const productSchema = z.object({
  din: z.string().min(1),
  name: z.string().min(1),
  genericName: z.string().nullable().optional(),
  isGeneric: z.boolean().optional(),
  strength: z.string().min(1),
  form: z.enum(FORMS),
  manufacturer: z.string().nullable().optional(),
  schedule: z.enum(SCHEDULES).optional(),
  isControlled: z.boolean().optional(),
  defaultPriceCents: z.number().int().min(0).optional(),
  interactionClasses: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const listQuery = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

// Catalog is global (shared DIN database) — readable by clinical/inventory roles.
router.get(
  '/',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' as const } },
            { din: { contains: q.search } },
            { genericName: { contains: q.search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, items] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ total, items, page: q.page, pageSize: q.pageSize });
  }),
);

router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw notFound('Product not found');
    res.json(product);
  }),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const { customFields: customFieldsInput, ...rest } = productSchema.parse(req.body);
    const customFields = await mergeCustomFields('PRODUCT', {}, customFieldsInput);
    const product = await prisma.product.create({ data: { ...rest, customFields } });
    await recordAudit({ action: 'CREATE', entity: 'Product', entityId: product.id, req });
    res.status(201).json(product);
  }),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Product not found');
    const { customFields: customFieldsInput, ...rest } = productSchema.partial().parse(req.body);
    const customFields = await mergeCustomFields('PRODUCT', existing.customFields as Record<string, unknown>, customFieldsInput);
    const product = await prisma.product.update({ where: { id: req.params.id }, data: { ...rest, customFields } });
    await recordAudit({ action: 'UPDATE', entity: 'Product', entityId: product.id, req });
    res.json(product);
  }),
);

export default router;
