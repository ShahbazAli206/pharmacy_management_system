import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';

function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId ?? undefined;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

export interface CreateShiftInput {
  userId: string;
  pharmacyId?: string;
  startAt: string;
  endAt: string;
  role?: string;
  notes?: string;
}

export interface UpdateShiftInput {
  startAt?: string;
  endAt?: string;
  role?: string;
  notes?: string;
}

function assertRange(startAt: Date, endAt: Date) {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw badRequest('startAt/endAt must be valid dates');
  }
  if (endAt <= startAt) throw badRequest('endAt must be after startAt');
}

/** List shifts for a location within an optional date range (defaults: from now, 14 days out). */
export async function listShifts(
  auth: AuthContext,
  requestedPharmacyId?: string,
  from?: Date,
  to?: Date,
) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const rangeStart = from ?? new Date();
  const rangeEnd = to ?? new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  return prisma.shift.findMany({
    where: {
      pharmacyId,
      status: { not: 'CANCELLED' },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } } },
    },
    orderBy: { startAt: 'asc' },
  });
}

/** The caller's own upcoming shifts (any authenticated staff member). */
export async function myShifts(auth: AuthContext) {
  return prisma.shift.findMany({
    where: {
      userId: auth.userId,
      status: { not: 'CANCELLED' },
      endAt: { gte: new Date() },
    },
    orderBy: { startAt: 'asc' },
    take: 50,
  });
}

export async function createShift(auth: AuthContext, input: CreateShiftInput) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  assertRange(startAt, endAt);

  const assignee = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!assignee || assignee.pharmacyId !== pharmacyId) {
    throw badRequest('Assignee must belong to the target location');
  }

  return prisma.shift.create({
    data: {
      userId: input.userId,
      pharmacyId,
      startAt,
      endAt,
      role: input.role,
      notes: input.notes,
      createdById: auth.userId,
    },
  });
}

export async function updateShift(auth: AuthContext, shiftId: string, input: UpdateShiftInput) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFound('Shift not found');
  assertLocationAccess(auth, shift.pharmacyId);
  if (shift.status === 'CANCELLED') throw forbidden('Cannot edit a cancelled shift');

  const startAt = input.startAt ? new Date(input.startAt) : shift.startAt;
  const endAt = input.endAt ? new Date(input.endAt) : shift.endAt;
  assertRange(startAt, endAt);

  return prisma.shift.update({
    where: { id: shiftId },
    data: { startAt, endAt, role: input.role ?? shift.role, notes: input.notes ?? shift.notes },
  });
}

export async function publishShift(auth: AuthContext, shiftId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFound('Shift not found');
  assertLocationAccess(auth, shift.pharmacyId);
  if (shift.status !== 'SCHEDULED') throw badRequest('Only scheduled shifts can be published');

  return prisma.shift.update({ where: { id: shiftId }, data: { status: 'PUBLISHED' } });
}

export async function cancelShift(auth: AuthContext, shiftId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFound('Shift not found');
  assertLocationAccess(auth, shift.pharmacyId);

  return prisma.shift.update({ where: { id: shiftId }, data: { status: 'CANCELLED' } });
}
