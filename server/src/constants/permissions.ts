import { RoleName } from '@prisma/client';

/**
 * Central permission catalog. Every protected endpoint references a key here.
 * The role -> permission mapping is seeded into the DB (RolePermission table);
 * this file is the source of truth used by the seed script. Runtime checks read
 * from the DB, never from this file directly.
 */
export const PERMISSIONS = {
  // Users & administration
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  PHARMACY_MANAGE: 'pharmacy:manage',

  // Dashboards
  DASHBOARD_OWNER: 'dashboard:owner',
  DASHBOARD_LOCATION: 'dashboard:location',

  // Patients
  PATIENT_READ: 'patient:read',
  PATIENT_WRITE: 'patient:write',
  PATIENT_EXPORT: 'patient:export',

  // Audit
  AUDIT_READ_ALL: 'audit:read:all',
  AUDIT_READ_LOCATION: 'audit:read:location',

  // Catalog & inventory (Phase 2)
  PRODUCT_MANAGE: 'product:manage',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',

  // Prescriptions & dispensing (Phase 2)
  PRESCRIBER_MANAGE: 'prescriber:manage',
  PRESCRIPTION_READ: 'prescription:read',
  PRESCRIPTION_WRITE: 'prescription:write',
  PRESCRIPTION_DISPENSE: 'prescription:dispense',

  // Point of sale (Phase 2)
  POS_SELL: 'pos:sell',

  // Compliance, narcotics, recalls (Phase 3)
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_WRITE: 'compliance:write',
  NARCOTICS_READ: 'narcotics:read',
  NARCOTICS_WRITE: 'narcotics:write',
  RECALL_READ: 'recall:read',
  RECALL_MANAGE: 'recall:manage',

  // Financials (Phase 4)
  FINANCE_READ: 'finance:read',
  FINANCE_WRITE: 'finance:write',
  EXPENSE_APPROVE: 'expense:approve',

  // Cameras & comms (Phase 5)
  CAMERA_VIEW: 'camera:view',
  CAMERA_MANAGE: 'camera:manage',
  MESSAGE_SEND: 'message:send',
  MESSAGE_BROADCAST: 'message:broadcast',
  NOTIFICATION_MANAGE: 'notification:manage',

  // Platform (Phase 6/7)
  FEATURE_FLAG_MANAGE: 'feature_flag:manage',
  SYSTEM_MONITOR: 'system:monitor',
  SEARCH_GLOBAL: 'search:global',

  // Documents & e-signature (Phase 8)
  DOCUMENT_READ: 'document:read',
  DOCUMENT_WRITE: 'document:write',
  SIGNATURE_MANAGE: 'signature:manage',
  DATA_IMPORT: 'data:import',

  // Platform config (Phase 9)
  SETTINGS_MANAGE: 'settings:manage',

  // Reporting (Phase 10)
  REPORT_RUN: 'report:run',

  // Workflow & admin tooling (Phase 11)
  WORKFLOW_APPROVE: 'workflow:approve',
  ROLE_SIMULATE: 'role:simulate',

  // HR — shift scheduling (Phase 12)
  SHIFT_READ: 'shift:read',
  SHIFT_WRITE: 'shift:write',

  // HR — incident reports (Phase 12)
  INCIDENT_READ: 'incident:read',
  INCIDENT_MANAGE: 'incident:manage',

  // HR — training / continuing-education tracking (Phase 12)
  TRAINING_READ: 'training:read',
  TRAINING_MANAGE: 'training:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PERMISSIONS.USER_MANAGE]: 'Create, edit, deactivate user accounts',
  [PERMISSIONS.ROLE_MANAGE]: 'Manage roles and the permission matrix',
  [PERMISSIONS.PHARMACY_MANAGE]: 'Create and configure pharmacy locations',
  [PERMISSIONS.DASHBOARD_OWNER]: 'View the consolidated owner dashboard',
  [PERMISSIONS.DASHBOARD_LOCATION]: 'View a single location dashboard',
  [PERMISSIONS.PATIENT_READ]: 'View patient records',
  [PERMISSIONS.PATIENT_WRITE]: 'Create and edit patient records',
  [PERMISSIONS.PATIENT_EXPORT]: 'Export patient data (DSAR)',
  [PERMISSIONS.AUDIT_READ_ALL]: 'View audit logs across all locations',
  [PERMISSIONS.AUDIT_READ_LOCATION]: "View this location's audit logs",
  [PERMISSIONS.PRODUCT_MANAGE]: 'Manage the product/drug catalog',
  [PERMISSIONS.INVENTORY_READ]: 'View inventory and stock levels',
  [PERMISSIONS.INVENTORY_WRITE]: 'Adjust stock, receive orders, manage suppliers',
  [PERMISSIONS.PRESCRIBER_MANAGE]: 'Manage prescriber records',
  [PERMISSIONS.PRESCRIPTION_READ]: 'View prescriptions and dispensing history',
  [PERMISSIONS.PRESCRIPTION_WRITE]: 'Enter and edit prescriptions',
  [PERMISSIONS.PRESCRIPTION_DISPENSE]: 'Dispense prescriptions (pharmacist)',
  [PERMISSIONS.POS_SELL]: 'Process point-of-sale transactions',
  [PERMISSIONS.COMPLIANCE_READ]: 'View compliance checklists and alerts',
  [PERMISSIONS.COMPLIANCE_WRITE]: 'Complete compliance tasks and resolve alerts',
  [PERMISSIONS.NARCOTICS_READ]: 'View the narcotics register and counts',
  [PERMISSIONS.NARCOTICS_WRITE]: 'Record narcotic transactions and counts',
  [PERMISSIONS.RECALL_READ]: 'View drug recalls and quarantines',
  [PERMISSIONS.RECALL_MANAGE]: 'Ingest recalls and manage quarantine workflow',
  [PERMISSIONS.FINANCE_READ]: 'View financial data',
  [PERMISSIONS.FINANCE_WRITE]: 'Create and edit financial entries',
  [PERMISSIONS.EXPENSE_APPROVE]: 'Approve or reject submitted expenses',
  [PERMISSIONS.CAMERA_VIEW]: 'View camera feeds',
  [PERMISSIONS.CAMERA_MANAGE]: 'Register and configure cameras',
  [PERMISSIONS.MESSAGE_SEND]: 'Send internal messages',
  [PERMISSIONS.MESSAGE_BROADCAST]: 'Broadcast messages across locations',
  [PERMISSIONS.NOTIFICATION_MANAGE]: 'Manage and send patient notifications',
  [PERMISSIONS.FEATURE_FLAG_MANAGE]: 'Toggle feature flags',
  [PERMISSIONS.SYSTEM_MONITOR]: 'View system health and monitoring',
  [PERMISSIONS.SEARCH_GLOBAL]: 'Use global cross-entity search',
  [PERMISSIONS.DOCUMENT_READ]: 'View documents',
  [PERMISSIONS.DOCUMENT_WRITE]: 'Upload and manage documents',
  [PERMISSIONS.SIGNATURE_MANAGE]: 'Request and manage e-signatures',
  [PERMISSIONS.DATA_IMPORT]: 'Bulk-import data from CSV',
  [PERMISSIONS.SETTINGS_MANAGE]: 'Manage system settings and maintenance mode',
  [PERMISSIONS.REPORT_RUN]: 'Run and save reports',
  [PERMISSIONS.WORKFLOW_APPROVE]: 'Approve or reject workflow requests',
  [PERMISSIONS.ROLE_SIMULATE]: 'Simulate role permissions',
  [PERMISSIONS.SHIFT_READ]: 'View the staff shift schedule',
  [PERMISSIONS.SHIFT_WRITE]: 'Create, edit, and cancel staff shifts',
  [PERMISSIONS.INCIDENT_READ]: "View this location's incident reports",
  [PERMISSIONS.INCIDENT_MANAGE]: 'Triage, update, and resolve incident reports',
  [PERMISSIONS.TRAINING_READ]: "View the team's training/CE records and expiry warnings",
  [PERMISSIONS.TRAINING_MANAGE]: 'Log and edit training/CE records on behalf of team members',
};

/**
 * Role -> permissions map. Enforces the spec's access matrix:
 *  - Owner: everything, all locations.
 *  - Partner: full access to their own pharmacy.
 *  - PIC: patients + (later) prescriptions/controlled substances.
 *  - Technician: patient view + (later) inventory.
 *  - Cashier: sales only, NO patient medical history.
 *  - Inventory Manager: stock only, NO patient records.
 *  - Accountant: financial data only, NO patient records.
 */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  SYSTEM_OWNER: Object.values(PERMISSIONS),
  LOCATION_PARTNER: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_WRITE,
    PERMISSIONS.PATIENT_EXPORT,
    PERMISSIONS.AUDIT_READ_LOCATION,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_WRITE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.PRESCRIBER_MANAGE,
    PERMISSIONS.PRESCRIPTION_READ,
    PERMISSIONS.PRESCRIPTION_WRITE,
    PERMISSIONS.PRESCRIPTION_DISPENSE,
    PERMISSIONS.POS_SELL,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.NARCOTICS_READ,
    PERMISSIONS.NARCOTICS_WRITE,
    PERMISSIONS.RECALL_READ,
    PERMISSIONS.RECALL_MANAGE,
    PERMISSIONS.EXPENSE_APPROVE,
    PERMISSIONS.CAMERA_VIEW,
    PERMISSIONS.CAMERA_MANAGE,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.NOTIFICATION_MANAGE,
    PERMISSIONS.SEARCH_GLOBAL,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.SIGNATURE_MANAGE,
    PERMISSIONS.DATA_IMPORT,
    PERMISSIONS.REPORT_RUN,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.SHIFT_READ,
    PERMISSIONS.SHIFT_WRITE,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.INCIDENT_MANAGE,
    PERMISSIONS.TRAINING_READ,
    PERMISSIONS.TRAINING_MANAGE,
  ],
  PHARMACIST_IN_CHARGE: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_WRITE,
    PERMISSIONS.PATIENT_EXPORT,
    PERMISSIONS.AUDIT_READ_LOCATION,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PRESCRIBER_MANAGE,
    PERMISSIONS.PRESCRIPTION_READ,
    PERMISSIONS.PRESCRIPTION_WRITE,
    PERMISSIONS.PRESCRIPTION_DISPENSE,
    PERMISSIONS.POS_SELL,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.NARCOTICS_READ,
    PERMISSIONS.NARCOTICS_WRITE,
    PERMISSIONS.RECALL_READ,
    PERMISSIONS.RECALL_MANAGE,
    PERMISSIONS.CAMERA_VIEW,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.NOTIFICATION_MANAGE,
    PERMISSIONS.SEARCH_GLOBAL,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.SIGNATURE_MANAGE,
    PERMISSIONS.REPORT_RUN,
    PERMISSIONS.SHIFT_READ,
    PERMISSIONS.SHIFT_WRITE,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.INCIDENT_MANAGE,
    PERMISSIONS.TRAINING_READ,
    PERMISSIONS.TRAINING_MANAGE,
  ],
  PHARMACY_TECHNICIAN: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.PRESCRIPTION_READ,
    PERMISSIONS.PRESCRIPTION_WRITE,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.NARCOTICS_READ,
    PERMISSIONS.RECALL_READ,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.SEARCH_GLOBAL,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.SHIFT_READ,
  ],
  CASHIER: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.POS_SELL,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.SHIFT_READ,
  ],
  INVENTORY_MANAGER: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.RECALL_READ,
    PERMISSIONS.RECALL_MANAGE,
    PERMISSIONS.MESSAGE_SEND,
    PERMISSIONS.SEARCH_GLOBAL,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DATA_IMPORT,
    PERMISSIONS.REPORT_RUN,
    PERMISSIONS.SHIFT_READ,
  ],
  ACCOUNTANT: [
    PERMISSIONS.DASHBOARD_LOCATION,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_WRITE,
    PERMISSIONS.EXPENSE_APPROVE,
    PERMISSIONS.SEARCH_GLOBAL,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.REPORT_RUN,
    PERMISSIONS.SHIFT_READ,
  ],
};
