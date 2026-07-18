export type RoleName =
  | 'SYSTEM_OWNER'
  | 'LOCATION_PARTNER'
  | 'PHARMACIST_IN_CHARGE'
  | 'PHARMACY_TECHNICIAN'
  | 'CASHIER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTANT';

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: RoleName;
  pharmacy: { id: string; name: string; code: string; province: string } | null;
  mfaEnabled: boolean;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: RoleName;
    pharmacyId: string | null;
    mfaEnabled: boolean;
    permissions: string[];
  };
}

export interface OwnerOverview {
  scope: 'ALL_LOCATIONS';
  totals: {
    locations: number;
    activeLocations: number;
    staff: number;
    patients: number;
    revenueToday: number;
    prescriptionsToday: number;
  };
  locations: Array<{
    id: string;
    name: string;
    code: string;
    province: string;
    status: string;
    staffCount: number;
    patientCount: number;
    revenueToday: number;
    prescriptionsToday: number;
    complianceStatus: 'GREEN' | 'YELLOW' | 'RED';
    lowStockAlerts: number;
    expiryAlerts: number;
  }>;
  pendingPartnerReports: number;
}

export interface LocationOverview {
  scope: 'SINGLE_LOCATION';
  pharmacy: { id: string; name: string; code: string; province: string; status: string };
  staffCount: number;
  patientCount: number;
  salesToday: number;
  prescriptionsToday: number;
  reorderAlerts: number;
  refillsDueToday: number;
  complianceChecklist: { total: number; completed: number };
}

export interface Patient {
  id: string;
  pharmacyId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  preferredLanguage: string;
  healthCard: string | null;
  insurancePlan: string | null;
  phone: string | null;
  email: string | null;
  allergies: Array<{ id: string; substance: string; severity: string; reaction: string | null }>;
  conditions: Array<{ id: string; name: string; diagnosis: string | null }>;
  isActive: boolean;
}

export interface Paginated<T> {
  total: number;
  items: T[];
  page: number;
  pageSize: number;
}

export interface InventoryRow {
  id: string;
  product: { id: string; name: string; din: string; strength: string; form: string };
  supplier: { id: string; name: string } | null;
  reorderThreshold: number;
  reorderQuantity: number;
  quantityOnHand: number;
  belowThreshold: boolean;
  lots: Array<{
    id: string;
    lotNumber: string | null;
    expiryDate: string | null;
    quantityOnHand: number;
    unitCostCents: number;
  }>;
}

export interface ExpiryAlert {
  lotId: string;
  product: string;
  din: string;
  lotNumber: string | null;
  expiryDate: string;
  daysToExpiry: number;
  bucket: '30' | '60' | '90' | 'EXPIRED';
  quantityOnHand: number;
}

export interface PrescriptionRow {
  id: string;
  drugName: string;
  strength: string;
  quantity: number;
  refillsAuthorized: number;
  refillsUsed: number;
  isControlled: boolean;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  patient: { id: string; firstName: string; lastName: string };
  prescriber: { id: string; firstName: string; lastName: string };
  dispensings: Array<{ id: string; dispensedAt: string; quantity: number }>;
}

export interface InteractionAlert {
  type: 'DRUG_INTERACTION' | 'DUPLICATE_THERAPY' | 'ALLERGY' | 'BEERS_CRITERIA';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  slot: number;
  completedAt: string | null;
  template: { requiresSignature: boolean; frequency: string };
  completedBy: { firstName: string; lastName: string } | null;
}

export interface ComplianceAlert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
}

export interface ComplianceScore {
  score: number;
  band: 'GREEN' | 'YELLOW' | 'RED';
  total: number;
  completed: number;
  openCriticalAlerts: number;
}

export interface LicenseWarnings {
  licenses: Array<{ kind: string; name: string; licenseNumber: string | null; expiry: string; days: number; bucket: string }>;
  permits: Array<{ kind: string; name: string; expiry: string; days: number; bucket: string }>;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

export interface PLReport {
  pharmacyId: string;
  period: { from: string; to: string };
  revenueCents: number;
  totalExpensesCents: number;
  netIncomeCents: number;
  expensesByCategory: Record<string, number>;
  taxCollectedCents: number;
  transactionCount: number;
}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  vendor: string | null;
  amountCents: number;
  taxCents: number;
  status: string;
  incurredOn: string;
  submittedByUserId: string;
  pharmacy: { name: string; code: string };
}

export interface CameraRow {
  id: string;
  label: string;
  placement: string;
  brand: string | null;
  ipAddress: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastSeenAt: string | null;
  pharmacy: { name: string; code: string };
}

export interface SystemHealth {
  status: string;
  uptimeSeconds: number;
  nodeVersion: string;
  counts: { pharmacies: number; users: number; patients: number; prescriptions: number; sales: number };
  operational: { openComplianceAlerts: number; pendingNotifications: number };
}
