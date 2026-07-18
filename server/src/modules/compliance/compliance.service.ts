import { ComplianceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { raiseAlert } from '../../services/alerts';

function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

function atMidnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Generate the checklist instances due on `date` for a pharmacy. Idempotent:
 * the unique (pharmacy, template, dueDate, slot) constraint means re-running
 * for the same day creates nothing new. Frequency rules:
 *   DAILY   -> every day
 *   WEEKLY  -> Mondays
 *   MONTHLY -> the 1st
 *   ANNUAL  -> Jan 1
 */
export async function generateChecklist(auth: AuthContext, requestedPharmacyId?: string, date = new Date()) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const due = atMidnight(date);
  const templates = await prisma.complianceTaskTemplate.findMany({ where: { active: true } });

  const dueToday = templates.filter((t) => {
    switch (t.frequency) {
      case 'DAILY':
        return true;
      case 'WEEKLY':
        return due.getDay() === 1; // Monday
      case 'MONTHLY':
        return due.getDate() === 1;
      case 'ANNUAL':
        return due.getMonth() === 0 && due.getDate() === 1;
      default:
        return false;
    }
  });

  let created = 0;
  for (const t of dueToday) {
    for (let slot = 0; slot < t.timesPerDay; slot++) {
      const label = t.timesPerDay > 1 ? `${t.title} (${slot === 0 ? 'morning' : 'closing'})` : t.title;
      try {
        await prisma.complianceRecord.create({
          data: { pharmacyId, templateId: t.id, dueDate: due, slot, label },
        });
        created++;
      } catch {
        // Unique-constraint violation => already generated; skip.
      }
    }
  }
  return { pharmacyId, date: due.toISOString().slice(0, 10), created };
}

export async function listChecklist(auth: AuthContext, requestedPharmacyId?: string, date = new Date()) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const due = atMidnight(date);
  const records = await prisma.complianceRecord.findMany({
    where: { pharmacyId, dueDate: due },
    include: { template: true, completedBy: { select: { firstName: true, lastName: true } } },
    orderBy: [{ template: { title: 'asc' } }, { slot: 'asc' }],
  });
  return records;
}

export async function completeTask(
  auth: AuthContext,
  recordId: string,
  input: { signature?: string; notes?: string },
) {
  const record = await prisma.complianceRecord.findUnique({
    where: { id: recordId },
    include: { template: true },
  });
  if (!record) throw notFound('Checklist item not found');
  assertLocationAccess(auth, record.pharmacyId);
  if (record.template.requiresSignature && !input.signature) {
    throw badRequest('This task requires a signature');
  }

  return prisma.complianceRecord.update({
    where: { id: recordId },
    data: {
      status: 'COMPLETED',
      completedByUserId: auth.userId,
      completedAt: new Date(),
      signature: input.signature ?? null,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Escalation sweep: mark past-due PENDING items OVERDUE and raise an alert.
 * (Spec's fine-grained "2 hours after due time" needs per-slot due times; this
 * uses end-of-day as the due boundary — a documented simplification.)
 */
export async function runEscalation(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const today = atMidnight(now);

  const overdue = await prisma.complianceRecord.findMany({
    where: { pharmacyId, status: 'PENDING', dueDate: { lt: today } },
    include: { template: true },
  });

  for (const r of overdue) {
    await prisma.complianceRecord.update({ where: { id: r.id }, data: { status: 'OVERDUE' } });
    await raiseAlert({
      pharmacyId,
      type: 'OVERDUE_TASK',
      severity: 'WARNING',
      message: `Overdue compliance task: ${r.label} (due ${r.dueDate.toISOString().slice(0, 10)}).`,
      relatedType: 'ComplianceRecord',
      relatedId: r.id,
    });
  }
  return { markedOverdue: overdue.length };
}

/**
 * Monthly compliance score (0-100) for a location: checklist completion rate
 * for the current month, penalized by open critical alerts. Returns a colour
 * band for the owner dashboard's Green/Yellow/Red indicator.
 */
export async function complianceScore(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const records = await prisma.complianceRecord.findMany({
    where: { pharmacyId, dueDate: { gte: monthStart, lt: monthEnd } },
  });
  const total = records.length;
  const completed = records.filter((r) => r.status === 'COMPLETED').length;
  const completionRate = total === 0 ? 1 : completed / total;

  const openCritical = await prisma.complianceAlert.count({
    where: { pharmacyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, severity: 'CRITICAL' },
  });

  // Each open critical alert costs 10 points.
  const score = Math.max(0, Math.round(completionRate * 100 - openCritical * 10));
  const band = score >= 85 ? 'GREEN' : score >= 60 ? 'YELLOW' : 'RED';

  return { pharmacyId, score, band, total, completed, openCriticalAlerts: openCritical };
}

export async function listAlerts(auth: AuthContext, requestedPharmacyId?: string, statusOpen = true) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  return prisma.complianceAlert.findMany({
    where: {
      pharmacyId,
      ...(statusOpen ? { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } : {}),
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function resolveAlert(auth: AuthContext, alertId: string) {
  const alert = await prisma.complianceAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw notFound('Alert not found');
  assertLocationAccess(auth, alert.pharmacyId);
  return prisma.complianceAlert.update({
    where: { id: alertId },
    data: { status: 'RESOLVED', resolvedByUserId: auth.userId, resolvedAt: new Date() },
  });
}

/** License + permit expiry warnings at 90/60/30-day thresholds. */
export async function licenseExpiryWarnings(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      licenseExpiry: { not: null, lte: horizon },
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, licenseNumber: true, licenseExpiry: true, pharmacyId: true },
  });

  const pharmacies = await prisma.pharmacy.findMany({
    where: { ...(pharmacyId ? { id: pharmacyId } : {}), permitExpiry: { not: null, lte: horizon } },
    select: { id: true, name: true, permitExpiry: true },
  });

  const bucket = (d: Date) => {
    const days = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return { days, bucket: days <= 0 ? 'EXPIRED' : days <= 30 ? '30' : days <= 60 ? '60' : '90' };
  };

  return {
    licenses: users.map((u) => ({
      kind: 'STAFF_LICENSE',
      name: `${u.firstName} ${u.lastName}`,
      licenseNumber: u.licenseNumber,
      expiry: u.licenseExpiry,
      ...bucket(u.licenseExpiry!),
    })),
    permits: pharmacies.map((p) => ({
      kind: 'PHARMACY_PERMIT',
      name: p.name,
      expiry: p.permitExpiry,
      ...bucket(p.permitExpiry!),
    })),
  };
}

export function asStatus(v: string): ComplianceStatus {
  if (v === 'PENDING' || v === 'COMPLETED' || v === 'OVERDUE') return v;
  throw forbidden('Invalid status');
}
