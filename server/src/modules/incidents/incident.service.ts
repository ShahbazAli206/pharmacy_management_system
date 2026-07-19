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

export interface CreateIncidentInput {
  pharmacyId?: string;
  category: string;
  severity?: string;
  occurredAt: string;
  location?: string;
  description: string;
}

export interface UpdateIncidentInput {
  category?: string;
  severity?: string;
  location?: string;
  description?: string;
  actionTaken?: string;
}

/** File an incident report — self-service, open to any authenticated staff member. */
export async function reportIncident(auth: AuthContext, input: CreateIncidentInput) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);

  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw badRequest('occurredAt must be a valid date');

  return prisma.incidentReport.create({
    data: {
      pharmacyId,
      reportedByUserId: auth.userId,
      category: input.category as never,
      severity: (input.severity as never) ?? 'LOW',
      occurredAt,
      location: input.location,
      description: input.description,
    },
  });
}

/** The caller's own filed reports. */
export async function myIncidents(auth: AuthContext) {
  return prisma.incidentReport.findMany({
    where: { reportedByUserId: auth.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/** Full incident list for a location (managers). Owner: all or ?pharmacyId; others: own location. */
export async function listIncidents(auth: AuthContext, requestedPharmacyId?: string, status?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  if (pharmacyId) assertLocationAccess(auth, pharmacyId);

  return prisma.incidentReport.findMany({
    where: {
      ...(pharmacyId ? { pharmacyId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } } },
      pharmacy: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function updateIncident(auth: AuthContext, id: string, input: UpdateIncidentInput) {
  const incident = await prisma.incidentReport.findUnique({ where: { id } });
  if (!incident) throw notFound('Incident report not found');
  assertLocationAccess(auth, incident.pharmacyId);
  if (incident.status === 'CLOSED') throw forbidden('Cannot edit a closed incident report');

  return prisma.incidentReport.update({
    where: { id },
    data: {
      category: (input.category as never) ?? incident.category,
      severity: (input.severity as never) ?? incident.severity,
      location: input.location ?? incident.location,
      description: input.description ?? incident.description,
      actionTaken: input.actionTaken ?? incident.actionTaken,
      status: incident.status === 'OPEN' ? 'UNDER_REVIEW' : incident.status,
    },
  });
}

export async function resolveIncident(auth: AuthContext, id: string, actionTaken?: string) {
  const incident = await prisma.incidentReport.findUnique({ where: { id } });
  if (!incident) throw notFound('Incident report not found');
  assertLocationAccess(auth, incident.pharmacyId);
  if (incident.status === 'CLOSED') throw badRequest('Incident report already closed');

  return prisma.incidentReport.update({
    where: { id },
    data: {
      status: 'RESOLVED',
      actionTaken: actionTaken ?? incident.actionTaken,
      resolvedByUserId: auth.userId,
      resolvedAt: new Date(),
    },
  });
}

export async function closeIncident(auth: AuthContext, id: string) {
  const incident = await prisma.incidentReport.findUnique({ where: { id } });
  if (!incident) throw notFound('Incident report not found');
  assertLocationAccess(auth, incident.pharmacyId);
  if (incident.status !== 'RESOLVED') throw badRequest('Only resolved incidents can be closed');

  return prisma.incidentReport.update({ where: { id }, data: { status: 'CLOSED' } });
}
