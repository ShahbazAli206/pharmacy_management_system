import { Router } from 'express';
import { z } from 'zod';
import { Prisma, RoleName } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission, assertLocationAccess, isOwner } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, forbidden, notFound, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { hashPassword } from '../../utils/password';
import { decryptNullable, encryptNullable } from '../../utils/crypto';

const router = Router();
router.use(authenticate);

const ASSIGNABLE_ROLES = [
  'LOCATION_PARTNER',
  'PHARMACIST_IN_CHARGE',
  'PHARMACY_TECHNICIAN',
  'CASHIER',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
  'SYSTEM_OWNER',
] as const;

/** Shape returned to clients — never exposes password hash or MFA secret. */
const publicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  licenseNumber: true,
  licenseExpiry: true,
  lastLoginAt: true,
  mfaEnabled: true,
  pharmacyId: true,
  role: { select: { name: true } },
  pharmacy: { select: { id: true, name: true, code: true } },
} satisfies Prisma.UserSelect;

async function resolveRoleId(role: RoleName): Promise<string> {
  const found = await prisma.role.findUnique({ where: { name: role } });
  if (!found) throw badRequest(`Unknown role: ${role}`);
  return found.id;
}

// List staff. Owner sees all (optional ?pharmacyId); others are scoped to theirs.
router.get(
  '/',
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const requested = typeof req.query.pharmacyId === 'string' ? req.query.pharmacyId : undefined;
    const pharmacyId = isOwner(req.auth) ? requested : req.auth.locationId ?? '__none__';
    const users = await prisma.user.findMany({
      where: pharmacyId ? { pharmacyId } : {},
      select: publicSelect,
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    });
    res.json(users);
  }),
);

// Single-staff detail, including the decrypted SIN — deliberately NOT part of
// publicSelect/the list endpoint above (mirrors how patient health-card/
// insurance IDs are only decrypted on the single-record read, never the list).
router.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { ...publicSelect, sinEnc: true },
    });
    if (!target) throw notFound('User not found');
    assertLocationAccess(req.auth, target.pharmacyId);
    const { sinEnc, ...rest } = target;
    await recordAudit({ action: 'READ', entity: 'User', entityId: target.id, req });
    res.json({ ...rest, sin: decryptNullable(sinEnc) });
  }),
);

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  pharmacyId: z.string().uuid().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  sin: z.string().nullable().optional(),
});

// Create a staff account.
router.post(
  '/',
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createSchema.parse(req.body);

    // Only the system owner may mint another SYSTEM_OWNER.
    if (input.role === 'SYSTEM_OWNER' && !isOwner(req.auth)) {
      throw forbidden('Only the owner can create an owner account');
    }

    // SYSTEM_OWNER spans all locations (no pharmacy); everyone else needs one.
    let pharmacyId: string | null;
    if (input.role === 'SYSTEM_OWNER') {
      pharmacyId = null;
    } else {
      pharmacyId = isOwner(req.auth) ? input.pharmacyId ?? null : req.auth.locationId;
      if (!pharmacyId) throw badRequest('pharmacyId is required for this role');
      assertLocationAccess(req.auth, pharmacyId); // non-owners pinned to their location
    }

    const roleId = await resolveRoleId(input.role);
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          roleId,
          pharmacyId,
          licenseNumber: input.licenseNumber ?? null,
          licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
          sinEnc: encryptNullable(input.sin),
        },
        select: publicSelect,
      });
      await recordAudit({ action: 'CREATE', entity: 'User', entityId: user.id, req });
      res.status(201).json(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw badRequest('A user with that email already exists');
      }
      throw e;
    }
  }),
);

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  licenseNumber: z.string().nullable().optional(),
  licenseExpiry: z.string().nullable().optional(),
  sin: z.string().nullable().optional(),
});

// Update a staff account (activate/deactivate, role, license).
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateSchema.parse(req.body);

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });
    if (!target) throw notFound('User not found');

    // Non-owners may only touch staff at their own location, never an owner,
    // and cannot promote anyone to owner (privilege-escalation guard).
    if (!isOwner(req.auth)) {
      if (target.role.name === 'SYSTEM_OWNER') throw forbidden('Cannot modify an owner account');
      assertLocationAccess(req.auth, target.pharmacyId);
      if (input.role === 'SYSTEM_OWNER') throw forbidden('Cannot assign the owner role');
    }
    // No one may deactivate their own account (avoid self-lockout).
    if (input.isActive === false && target.id === req.auth.userId) {
      throw badRequest('You cannot deactivate your own account');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.role) data.role = { connect: { id: await resolveRoleId(input.role) } };
    if (input.licenseNumber !== undefined) data.licenseNumber = input.licenseNumber;
    if (input.licenseExpiry !== undefined) {
      data.licenseExpiry = input.licenseExpiry ? new Date(input.licenseExpiry) : null;
    }
    if (input.sin !== undefined) data.sinEnc = encryptNullable(input.sin);

    const user = await prisma.user.update({
      where: { id: target.id },
      data,
      select: publicSelect,
    });
    await recordAudit({ action: 'UPDATE', entity: 'User', entityId: user.id, req });
    res.json(user);
  }),
);

export default router;
