import { NotificationChannel } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest } from '../../utils/httpError';
import { getNotificationProvider } from '../../services/notifications';

function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

/**
 * Generate refill reminders for active prescriptions with fills remaining,
 * for patients who opted in (CASL). De-dupes against existing PENDING reminders
 * for the same patient so repeated runs don't pile up.
 */
export async function generateRefillReminders(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);

  const active = await prisma.prescription.findMany({
    where: { pharmacyId, status: 'ACTIVE' },
    include: { patient: true },
  });

  let created = 0;
  for (const rx of active) {
    const fillsRemaining = 1 + rx.refillsAuthorized - rx.refillsUsed;
    if (fillsRemaining <= 0) continue;
    const p = rx.patient;
    if (!p.smsOptIn && !p.emailOptIn) continue; // CASL: opt-in only

    const existing = await prisma.notification.findFirst({
      where: { patientId: p.id, type: 'REFILL_REMINDER', status: 'PENDING' },
    });
    if (existing) continue;

    const channel: NotificationChannel = p.smsOptIn ? 'SMS' : 'EMAIL';
    await prisma.notification.create({
      data: {
        pharmacyId,
        patientId: p.id,
        channel,
        type: 'REFILL_REMINDER',
        subject: 'Prescription refill reminder',
        message: `Hi ${p.firstName}, your prescription for ${rx.drugName} ${rx.strength} is due for refill. Reply STOP to opt out.`,
      },
    });
    created++;
  }
  return { created };
}

/** Dispatch PENDING notifications through the configured provider. */
export async function dispatchPending(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const pending = await prisma.notification.findMany({
    where: { pharmacyId, status: 'PENDING' },
    take: 200,
  });

  // Notification.patientId is a plain column (no relation); load contacts in one query.
  const patientIds = [...new Set(pending.map((n) => n.patientId).filter((id): id is string => !!id))];
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: { id: true, phone: true, email: true },
  });
  const contactById = new Map(patients.map((p) => [p.id, p]));

  const provider = getNotificationProvider();
  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    const contact = n.patientId ? contactById.get(n.patientId) : undefined;
    const to = n.channel === 'SMS' ? contact?.phone : contact?.email;
    if (!to) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: 'No contact on file' } });
      failed++;
      continue;
    }
    const result = await provider.send({ channel: n.channel, to, subject: n.subject ?? undefined, body: n.message });
    await prisma.notification.update({
      where: { id: n.id },
      data: result.ok
        ? { status: 'SENT', sentAt: new Date() }
        : { status: 'FAILED', error: result.error ?? 'send failed' },
    });
    result.ok ? sent++ : failed++;
  }
  return { attempted: pending.length, sent, failed, provider: provider.name };
}

export async function listNotifications(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  return prisma.notification.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
