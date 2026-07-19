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

export interface LogTrainingInput {
  userId?: string;
  pharmacyId?: string;
  title: string;
  provider?: string;
  category?: string;
  creditHours?: number;
  completedAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface UpdateTrainingInput {
  title?: string;
  provider?: string;
  category?: string;
  creditHours?: number;
  completedAt?: string;
  expiresAt?: string;
  notes?: string;
}

const canManage = (auth: AuthContext) => isOwner(auth) || auth.permissions.has('training:manage');

/**
 * Log a completed training/CE record. Self-service: any authenticated user
 * can log their own. Logging on behalf of another staff member requires
 * `training:manage` and the target must belong to the resolved location.
 */
export async function logTraining(auth: AuthContext, input: LogTrainingInput) {
  const targetUserId = input.userId ?? auth.userId;
  const onBehalfOf = targetUserId !== auth.userId;
  if (onBehalfOf && !canManage(auth)) {
    throw forbidden('Only a manager can log training on behalf of another staff member');
  }

  const pharmacyId = onBehalfOf ? scopeFor(auth, input.pharmacyId) : input.pharmacyId ?? auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  if (!isOwner(auth) || onBehalfOf) assertLocationAccess(auth, pharmacyId);

  if (onBehalfOf) {
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target || target.pharmacyId !== pharmacyId) {
      throw badRequest('Target user must belong to the resolved location');
    }
  }

  const completedAt = new Date(input.completedAt);
  if (Number.isNaN(completedAt.getTime())) throw badRequest('completedAt must be a valid date');
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw badRequest('expiresAt must be a valid date');

  return prisma.trainingRecord.create({
    data: {
      userId: targetUserId,
      pharmacyId,
      title: input.title,
      provider: input.provider,
      category: (input.category as never) ?? 'CONTINUING_EDUCATION',
      creditHours: input.creditHours,
      completedAt,
      expiresAt,
      notes: input.notes,
      recordedByUserId: auth.userId,
    },
  });
}

/** The caller's own training/CE history. */
export async function myTraining(auth: AuthContext) {
  return prisma.trainingRecord.findMany({
    where: { userId: auth.userId },
    orderBy: { completedAt: 'desc' },
    take: 100,
  });
}

/** Team training records (managers). Owner: all or ?pharmacyId; others: own location. */
export async function listTraining(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);

  return prisma.trainingRecord.findMany({
    where: pharmacyId ? { pharmacyId } : {},
    include: {
      user: { select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } } },
      pharmacy: { select: { code: true, name: true } },
    },
    orderBy: { completedAt: 'desc' },
    take: 200,
  });
}

/** Credentials expiring within 90/60/30-day thresholds (mirrors license-expiry buckets). */
export async function expiringTraining(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const rows = await prisma.trainingRecord.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      expiresAt: { not: null, lte: horizon },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      pharmacy: { select: { code: true, name: true } },
    },
    orderBy: { expiresAt: 'asc' },
  });

  const bucket = (d: Date) => {
    const days = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return { days, bucket: days <= 0 ? 'EXPIRED' : days <= 30 ? '30' : days <= 60 ? '60' : '90' };
  };

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    name: `${r.user.firstName} ${r.user.lastName}`,
    pharmacy: r.pharmacy.name,
    expiresAt: r.expiresAt,
    ...bucket(r.expiresAt!),
  }));
}

export async function updateTraining(auth: AuthContext, id: string, input: UpdateTrainingInput) {
  const record = await prisma.trainingRecord.findUnique({ where: { id } });
  if (!record) throw notFound('Training record not found');
  if (record.userId !== auth.userId) {
    if (!canManage(auth)) throw forbidden('Only a manager can edit another staff member\'s record');
    assertLocationAccess(auth, record.pharmacyId);
  }

  const completedAt = input.completedAt ? new Date(input.completedAt) : record.completedAt;
  if (Number.isNaN(completedAt.getTime())) throw badRequest('completedAt must be a valid date');
  const expiresAt = input.expiresAt !== undefined ? new Date(input.expiresAt) : record.expiresAt;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw badRequest('expiresAt must be a valid date');

  return prisma.trainingRecord.update({
    where: { id },
    data: {
      title: input.title ?? record.title,
      provider: input.provider ?? record.provider,
      category: (input.category as never) ?? record.category,
      creditHours: input.creditHours ?? record.creditHours,
      completedAt,
      expiresAt,
      notes: input.notes ?? record.notes,
    },
  });
}
