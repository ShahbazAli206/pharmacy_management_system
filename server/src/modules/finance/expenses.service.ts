import { ExpenseCategory, ExpenseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { getSettings } from '../../services/settings';
import { craRemittanceDueDate } from '../../services/craRemittance';

function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

export interface ExpenseInput {
  pharmacyId?: string;
  category: ExpenseCategory;
  subType?: string;
  description: string;
  amountCents: number;
  taxCents?: number;
  vendor?: string;
  incurredOn: string;
  dueDate?: string;
  recurring?: boolean;
  renewalDate?: string;
  attachmentPath?: string;
}

export async function listExpenses(
  auth: AuthContext,
  opts: { requestedPharmacyId?: string; status?: ExpenseStatus; category?: ExpenseCategory; from?: string; to?: string },
) {
  const pharmacyId = isOwner(auth) ? opts.requestedPharmacyId : auth.locationId;
  const where: Prisma.ExpenseWhereInput = {
    ...(pharmacyId ? { pharmacyId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.from || opts.to
      ? { incurredOn: { ...(opts.from ? { gte: new Date(opts.from) } : {}), ...(opts.to ? { lte: new Date(opts.to) } : {}) } }
      : {}),
  };
  return prisma.expense.findMany({
    where,
    include: { pharmacy: { select: { name: true, code: true } } },
    orderBy: { incurredOn: 'desc' },
  });
}

export async function createExpense(auth: AuthContext, input: ExpenseInput) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);
  const incurredOn = new Date(input.incurredOn);

  // PAYROLL entries get an auto-computed CRA remittance due date (spec §11)
  // when the caller didn't explicitly set one — an explicit dueDate always
  // wins, since a bookkeeper may know a better date than the generic rule.
  let dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (!dueDate && input.category === 'PAYROLL') {
    const { craRemitterType } = await getSettings();
    dueDate = craRemittanceDueDate(incurredOn, craRemitterType);
  }

  return prisma.expense.create({
    data: {
      pharmacyId,
      category: input.category,
      subType: input.subType ?? null,
      description: input.description,
      amountCents: input.amountCents,
      taxCents: input.taxCents ?? 0,
      vendor: input.vendor ?? null,
      incurredOn,
      dueDate,
      recurring: input.recurring ?? false,
      renewalDate: input.renewalDate ? new Date(input.renewalDate) : null,
      attachmentPath: input.attachmentPath ?? null,
      status: 'SUBMITTED',
      submittedByUserId: auth.userId,
    },
  });
}

/** Approval workflow: only APPROVE/REJECT a SUBMITTED expense. */
export async function decideExpense(auth: AuthContext, id: string, decision: 'APPROVED' | 'REJECTED') {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw notFound('Expense not found');
  assertLocationAccess(auth, expense.pharmacyId);
  if (expense.status !== 'SUBMITTED') throw badRequest(`Expense is ${expense.status}, cannot decide`);
  // A user cannot approve their own submission.
  if (expense.submittedByUserId === auth.userId) {
    throw forbidden('You cannot approve your own expense');
  }
  return prisma.expense.update({
    where: { id },
    data: { status: decision, approvedByUserId: auth.userId, approvedAt: new Date() },
  });
}

export async function markPaid(auth: AuthContext, id: string) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw notFound('Expense not found');
  assertLocationAccess(auth, expense.pharmacyId);
  if (expense.status !== 'APPROVED') throw badRequest('Only approved expenses can be marked paid');
  return prisma.expense.update({ where: { id }, data: { status: 'PAID' } });
}

/** Upcoming renewal alerts (rent, insurance, licenses) within 60 days. */
export async function renewalAlerts(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  return prisma.expense.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      renewalDate: { not: null, lte: horizon, gte: now },
    },
    orderBy: { renewalDate: 'asc' },
  });
}
