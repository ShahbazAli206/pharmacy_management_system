import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { lowStock } from '../inventory/inventory.service';

/** Start/end of the current local day, for "today" aggregations. */
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Owner consolidated overview across all locations. Roster/staff/patient counts
 * plus real today's revenue (from POS sales) and prescription volume, grouped by
 * location. Revenue is returned in dollars (the client formats it as currency).
 */
export async function ownerOverview() {
  const { start, end } = todayRange();

  const [pharmacies, salesByLoc, rxByLoc] = await Promise.all([
    prisma.pharmacy.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { users: true, patients: true } } },
    }),
    prisma.sale.groupBy({
      by: ['pharmacyId'],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { totalCents: true },
    }),
    prisma.prescription.groupBy({
      by: ['pharmacyId'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);

  const revCents = new Map(salesByLoc.map((s) => [s.pharmacyId, s._sum.totalCents ?? 0]));
  const rxCount = new Map(rxByLoc.map((r) => [r.pharmacyId, r._count._all]));

  const locations = pharmacies.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    province: p.province,
    status: p.status,
    staffCount: p._count.users,
    patientCount: p._count.patients,
    revenueToday: (revCents.get(p.id) ?? 0) / 100,
    prescriptionsToday: rxCount.get(p.id) ?? 0,
    complianceStatus: 'GREEN' as const,
    lowStockAlerts: 0,
    expiryAlerts: 0,
  }));

  return {
    scope: 'ALL_LOCATIONS',
    totals: {
      locations: pharmacies.length,
      activeLocations: pharmacies.filter((p) => p.status === 'ACTIVE').length,
      staff: locations.reduce((s, l) => s + l.staffCount, 0),
      patients: locations.reduce((s, l) => s + l.patientCount, 0),
      revenueToday: locations.reduce((s, l) => s + l.revenueToday, 0),
      prescriptionsToday: locations.reduce((s, l) => s + l.prescriptionsToday, 0),
    },
    locations,
    pendingPartnerReports: 0,
  };
}

/** Partner/location dashboard scoped to a single pharmacy. */
export async function locationOverview(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  if (!pharmacyId) {
    throw new Error('No pharmacy in scope');
  }
  assertLocationAccess(auth, pharmacyId);

  const { start, end } = todayRange();
  const [pharmacy, salesAgg, rxToday, belowThreshold] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: { _count: { select: { users: true, patients: true } } },
    }),
    prisma.sale.aggregate({
      where: { pharmacyId, createdAt: { gte: start, lt: end } },
      _sum: { totalCents: true },
    }),
    prisma.prescription.count({ where: { pharmacyId, createdAt: { gte: start, lt: end } } }),
    lowStock(auth, pharmacyId), // items at/under their reorder threshold
  ]);
  if (!pharmacy) throw new Error('Pharmacy not found');

  return {
    scope: 'SINGLE_LOCATION',
    pharmacy: {
      id: pharmacy.id,
      name: pharmacy.name,
      code: pharmacy.code,
      province: pharmacy.province,
      status: pharmacy.status,
    },
    staffCount: pharmacy._count.users,
    patientCount: pharmacy._count.patients,
    salesToday: (salesAgg._sum.totalCents ?? 0) / 100, // dollars
    prescriptionsToday: rxToday,
    reorderAlerts: belowThreshold.length,
    refillsDueToday: 0,
    complianceChecklist: { total: 0, completed: 0 },
  };
}
