import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';

/**
 * Owner consolidated overview across all locations. Revenue/prescription/
 * compliance figures are stubbed as zero for Phase 1 (those modules arrive in
 * Phases 2–4); the location roster, staff headcount, and patient counts are
 * real so the dashboard is wired end-to-end.
 */
export async function ownerOverview() {
  const pharmacies = await prisma.pharmacy.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { users: true, patients: true } },
    },
  });

  const locations = pharmacies.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    province: p.province,
    status: p.status,
    staffCount: p._count.users,
    patientCount: p._count.patients,
    // Placeholders until later phases populate them.
    revenueToday: 0,
    prescriptionsToday: 0,
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
      revenueToday: 0,
      prescriptionsToday: 0,
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

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    include: { _count: { select: { users: true, patients: true } } },
  });
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
    // Placeholders for later-phase modules.
    salesToday: 0,
    prescriptionsToday: 0,
    reorderAlerts: 0,
    refillsDueToday: 0,
    complianceChecklist: { total: 0, completed: 0 },
  };
}
