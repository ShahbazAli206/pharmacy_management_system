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

export interface CreateReviewInput {
  userId: string;
  pharmacyId?: string;
  periodStart: string;
  periodEnd: string;
  rating: string;
  strengths?: string;
  areasForImprovement?: string;
  goals?: string;
  comments?: string;
}

export interface UpdateReviewInput {
  periodStart?: string;
  periodEnd?: string;
  rating?: string;
  strengths?: string;
  areasForImprovement?: string;
  goals?: string;
  comments?: string;
}

function assertPeriod(periodStart: Date, periodEnd: Date) {
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw badRequest('periodStart/periodEnd must be valid dates');
  }
  if (periodEnd <= periodStart) throw badRequest('periodEnd must be after periodStart');
}

/** Draft a review for a subordinate — manager-only (review:manage), one draft per (user, period) is not enforced, allowing amendments. */
export async function createReview(auth: AuthContext, input: CreateReviewInput) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);

  const subject = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!subject || subject.pharmacyId !== pharmacyId) {
    throw badRequest('Review subject must belong to the target location');
  }

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  assertPeriod(periodStart, periodEnd);

  return prisma.performanceReview.create({
    data: {
      userId: input.userId,
      pharmacyId,
      reviewerUserId: auth.userId,
      periodStart,
      periodEnd,
      rating: input.rating as never,
      strengths: input.strengths,
      areasForImprovement: input.areasForImprovement,
      goals: input.goals,
      comments: input.comments,
    },
  });
}

/** The caller's own reviews — drafts are withheld until the reviewer submits them. */
export async function myReviews(auth: AuthContext) {
  return prisma.performanceReview.findMany({
    where: { userId: auth.userId, status: { not: 'DRAFT' } },
    include: { reviewer: { select: { firstName: true, lastName: true } } },
    orderBy: { periodEnd: 'desc' },
    take: 50,
  });
}

/** Team reviews (managers). Owner: all or ?pharmacyId; others: own location. */
export async function listReviews(auth: AuthContext, requestedPharmacyId?: string, status?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);

  return prisma.performanceReview.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } } },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      pharmacy: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function updateReview(auth: AuthContext, id: string, input: UpdateReviewInput) {
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) throw notFound('Performance review not found');
  assertLocationAccess(auth, review.pharmacyId);
  if (review.status === 'ACKNOWLEDGED') throw forbidden('Cannot edit an acknowledged review');

  const periodStart = input.periodStart ? new Date(input.periodStart) : review.periodStart;
  const periodEnd = input.periodEnd ? new Date(input.periodEnd) : review.periodEnd;
  assertPeriod(periodStart, periodEnd);

  return prisma.performanceReview.update({
    where: { id },
    data: {
      periodStart,
      periodEnd,
      rating: (input.rating as never) ?? review.rating,
      strengths: input.strengths ?? review.strengths,
      areasForImprovement: input.areasForImprovement ?? review.areasForImprovement,
      goals: input.goals ?? review.goals,
      comments: input.comments ?? review.comments,
    },
  });
}

export async function submitReview(auth: AuthContext, id: string) {
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) throw notFound('Performance review not found');
  assertLocationAccess(auth, review.pharmacyId);
  if (review.status !== 'DRAFT') throw badRequest('Only draft reviews can be submitted');

  return prisma.performanceReview.update({ where: { id }, data: { status: 'SUBMITTED' } });
}

/** Self-service acknowledgment — the reviewed employee only. */
export async function acknowledgeReview(auth: AuthContext, id: string) {
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) throw notFound('Performance review not found');
  if (review.userId !== auth.userId) throw forbidden('Only the reviewed employee can acknowledge this review');
  if (review.status !== 'SUBMITTED') throw badRequest('Only submitted reviews can be acknowledged');

  return prisma.performanceReview.update({
    where: { id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  });
}
