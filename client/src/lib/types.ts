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
  addressLine1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  emergencyContact?: string | null;
  smsOptIn?: boolean;
  emailOptIn?: boolean;
  customFields: Record<string, unknown>;
  allergies: Array<{ id: string; substance: string; severity: string; reaction: string | null }>;
  conditions: Array<{ id: string; name: string; diagnosis: string | null }>;
  isActive: boolean;
}

export interface CustomFieldDefinition {
  id: string;
  entityType: 'PATIENT' | 'PRODUCT';
  key: string;
  label: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  options: string | null; // JSON-encoded string[] when fieldType is SELECT
  required: boolean;
  active: boolean;
  sortOrder: number;
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

export interface BudgetVariance {
  pharmacyId: string;
  month: string;
  lines: Array<{
    category: string;
    budgetedCents: number;
    actualCents: number;
    varianceCents: number;
    variancePct: number | null;
  }>;
  totals: { budgetedCents: number; actualCents: number; varianceCents: number };
}

export interface CashFlowForecast {
  pharmacyId: string;
  history: Array<{ month: string; revenueCents: number; expensesCents: number; netCashFlowCents: number }>;
  forecast: Array<{ month: string; netCashFlowCents: number }>;
  method: string;
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
  streamUrl: string | null;
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

// ---- Phase 8: Documents, e-signature, bulk import ----
export interface DocumentRow {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SignatureRow {
  id: string;
  documentId: string;
  signerName: string;
  signerEmail: string;
  status: 'PENDING' | 'SIGNED' | 'DECLINED';
  signedAt: string | null;
  createdAt: string;
}

export interface ImportResult {
  entity: string;
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

// ---- Phase 9: Settings + notification preferences ----
export interface SystemSettings {
  maintenanceMode: boolean;
  dataRetentionDays: number;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLocale: string;
}

export interface NotificationPreference {
  sms: boolean;
  email: boolean;
  push: boolean;
  inApp: boolean;
}

// ---- Phase 10: Reporting ----
export interface SavedReportRow {
  id: string;
  name: string;
  type: string;
  paramsJson: string;
  createdAt: string;
}

export interface ReportResult {
  type: string;
  series?: Array<{ date: string; value?: number; valueCents?: number }>;
  data?: Record<string, number>;
  history?: Array<{ date: string; valueCents: number }>;
  forecast?: Array<{ date: string; valueCents: number }>;
  method?: string;
}

// ---- Sales / POS ----
export interface ProductRow {
  id: string;
  din: string;
  name: string;
  genericName: string | null;
  strength: string;
  form: string;
  schedule: string;
  isControlled: boolean;
  defaultPriceCents: number;
}

export interface ProductDetail {
  id: string;
  din: string;
  name: string;
  genericName: string | null;
  isGeneric: boolean;
  strength: string;
  form: string;
  manufacturer: string | null;
  schedule: string;
  isControlled: boolean;
  defaultPriceCents: number;
  interactionClasses: string;
  customFields: Record<string, unknown>;
}

export type SaleItemType = 'OTC' | 'RX' | 'COMPOUND' | 'SERVICE';
export type PaymentMethod = 'CASH' | 'DEBIT' | 'CREDIT' | 'INSURANCE';

export interface SaleResponse {
  id: string;
  province: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentTransactionId?: string | null;
  insuranceClaimId?: string | null;
  insuranceCoveredCents?: number | null;
  createdAt: string;
  lines: Array<{
    id: string;
    itemType: SaleItemType;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    taxable: boolean;
  }>;
}

export interface RefundLineRow {
  id: string;
  saleLineId: string;
  quantity: number;
  amountCents: number;
  saleLine: { description: string; itemType: SaleItemType; quantity: number; unitPriceCents: number };
}

export type RefundStatus = 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED';

export interface RefundRow {
  id: string;
  saleId: string;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  lines: RefundLineRow[];
}

export interface DailySummary {
  date: string;
  transactionCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  byPaymentMethod: Record<string, number>;
}

// ---- Messaging ----
export interface MessageRow {
  id: string;
  senderUserId: string;
  senderName: string;
  scope: 'LOCATION' | 'BROADCAST';
  pharmacyId: string | null;
  subject: string | null;
  body: string;
  createdAt: string;
}

// ---- Phase 11: Workflow, role simulator, timeline ----
export interface WorkflowRow {
  id: string;
  pharmacyId: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedByUserId: string;
  createdAt: string;
}
