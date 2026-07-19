/**
 * i18n scope (a best-guess, since the roadmap item had no spec): English +
 * French. Justified by two things already in this codebase, not an arbitrary
 * language list — `Patient.preferredLanguage` exists in the schema, and the
 * seed data includes Quebec locations (regulatory body OPQ), where French is
 * a legal requirement for customer-facing software (Charter of the French
 * Language / Bill 96), not just a nice-to-have.
 *
 * Coverage is deliberately partial, not full-app: the persistent chrome
 * (sidebar nav, user box) plus Login and Settings are fully translated as a
 * complete, verifiable slice and a working demonstration of the pattern.
 * Adding a page is: import useI18n, wrap strings in t('key'), add the key
 * here. See STATUS.md for what's covered vs. not.
 *
 * The French strings received a careful self-review pass (grammar, natural
 * phrasing, consistent typographic apostrophes, Quebec-French terms like
 * "courriel"/"stupéfiants" over France-French equivalents) — but this is
 * still an AI review, not a real bilingual human's. Get one before relying on
 * this for a real Quebec rollout, given the Charter of the French Language
 * stakes.
 */
export type Locale = 'en' | 'fr';

export const LOCALES: Locale[] = ['en', 'fr'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

const en = {
  // Brand / shell
  brandName: 'PharmaSuite',
  brandTagline: 'Management System',

  // Nav
  navOwnerOverview: 'Owner Overview',
  navMyLocation: 'My Location',
  navPatients: 'Patients',
  navPrescriptions: 'Prescriptions',
  navPointOfSale: 'Point of Sale',
  navInventory: 'Inventory',
  navProducts: 'Product Catalog',
  navTransfers: 'Transfers',
  navPrescribers: 'Prescribers',
  navNarcotics: 'Narcotics',
  navRecalls: 'Recalls',
  navCompliance: 'Compliance',
  navFinance: 'Finance',
  navReports: 'Reports',
  navDocuments: 'Documents',
  navCameras: 'Cameras',
  navMessages: 'Messages',
  navNotifications: 'Notifications',
  navWorkflow: 'Workflow',
  navAuditLog: 'Audit Log',
  navStaff: 'Staff',
  navAttendance: 'Attendance',
  navScheduling: 'Scheduling',
  navIncidentReports: 'Incident Reports',
  navTrainingCE: 'Training & CE',
  navPerformanceReviews: 'Performance Reviews',
  navSettings: 'Settings',
  navAdministration: 'Administration',
  navSearch: 'Search',
  searchShortcutHint: 'Ctrl+K',
  darkMode: '☾ Dark mode',
  lightMode: '☀ Light mode',
  signOut: 'Sign out',

  // Login
  loginTitle: 'PharmaSuite',
  loginSubtitle: 'Pharmacy Management System',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  loginFailedFallback: 'Login failed. Is the API running?',
  loginSeedHint: 'Seed account:',

  // Settings
  settingsTitle: 'Settings',
  settingsSubtitle: 'System configuration and your notification preferences',
  settingsSaved: 'Settings saved.',
  systemSettingsHeading: 'System settings',
  maintenanceModeLabel: 'Maintenance mode',
  maintenanceModeDesc: 'When on, the system is read-only — all writes are blocked except sign-in and settings.',
  on: 'ON',
  off: 'OFF',
  dataRetentionLabel: 'Data retention (days, ≥ 3650)',
  defaultCurrencyLabel: 'Default currency',
  defaultTimezoneLabel: 'Default timezone',
  defaultLocaleLabel: 'Default locale (system-wide)',
  saveSettingsButton: 'Save settings',
  myNotificationPrefsHeading: 'My notification preferences',
  channelSms: 'SMS',
  channelEmail: 'EMAIL',
  channelPush: 'PUSH',
  channelInApp: 'In-app',
  languageHeading: 'My language',
  languageDesc: 'Overrides the system-wide default above for your own session only.',
  useSystemDefault: 'Use system default',

  roleSystemOwner: 'System Owner',
  roleLocationPartner: 'Location Partner',
  rolePharmacistInCharge: 'Pharmacist-in-Charge',
  rolePharmacyTechnician: 'Pharmacy Technician',
  roleCashier: 'Cashier',
  roleInventoryManager: 'Inventory Manager',
  roleAccountant: 'Accountant',
} as const;

const fr: Record<keyof typeof en, string> = {
  brandName: 'PharmaSuite',
  brandTagline: 'Système de gestion',

  navOwnerOverview: 'Aperçu du propriétaire',
  navMyLocation: 'Mon établissement',
  navPatients: 'Patients',
  navPrescriptions: 'Ordonnances',
  navPointOfSale: 'Point de vente',
  navInventory: 'Inventaire',
  navProducts: 'Catalogue de produits',
  navTransfers: 'Transferts',
  navPrescribers: 'Prescripteurs',
  navNarcotics: 'Stupéfiants',
  navRecalls: 'Rappels',
  navCompliance: 'Conformité',
  navFinance: 'Finances',
  navReports: 'Rapports',
  navDocuments: 'Documents',
  navCameras: 'Caméras',
  navMessages: 'Messages',
  navNotifications: 'Notifications',
  navWorkflow: 'Flux de travail',
  navAuditLog: 'Journal d’audit',
  navStaff: 'Personnel',
  navAttendance: 'Présence',
  navScheduling: 'Horaire',
  navIncidentReports: 'Rapports d’incident',
  navTrainingCE: 'Formation continue',
  navPerformanceReviews: 'Évaluations de rendement',
  navSettings: 'Paramètres',
  navAdministration: 'Administration',
  navSearch: 'Rechercher',
  searchShortcutHint: 'Ctrl+K',
  darkMode: '☾ Mode sombre',
  lightMode: '☀ Mode clair',
  signOut: 'Se déconnecter',

  loginTitle: 'PharmaSuite',
  loginSubtitle: 'Système de gestion de pharmacie',
  emailLabel: 'Courriel',
  passwordLabel: 'Mot de passe',
  signIn: 'Se connecter',
  signingIn: 'Connexion en cours…',
  loginFailedFallback: 'Échec de la connexion. L’API est-elle démarrée?',
  loginSeedHint: 'Compte de démonstration :',

  settingsTitle: 'Paramètres',
  settingsSubtitle: 'Configuration du système et vos préférences de notification',
  settingsSaved: 'Paramètres enregistrés.',
  systemSettingsHeading: 'Paramètres du système',
  maintenanceModeLabel: 'Mode de maintenance',
  maintenanceModeDesc:
    'Lorsqu’il est activé, le système passe en lecture seule : toutes les écritures sont bloquées, sauf la connexion et les paramètres.',
  on: 'ACTIVÉ',
  off: 'DÉSACTIVÉ',
  dataRetentionLabel: 'Conservation des données (jours, ≥ 3650)',
  defaultCurrencyLabel: 'Devise par défaut',
  defaultTimezoneLabel: 'Fuseau horaire par défaut',
  defaultLocaleLabel: 'Langue par défaut (à l’échelle du système)',
  saveSettingsButton: 'Enregistrer les paramètres',
  myNotificationPrefsHeading: 'Mes préférences de notification',
  channelSms: 'SMS',
  channelEmail: 'COURRIEL',
  channelPush: 'PUSH',
  channelInApp: 'Application',
  languageHeading: 'Ma langue',
  languageDesc: 'Remplace le paramètre par défaut ci-dessus, pour votre session seulement.',
  useSystemDefault: 'Revenir au paramètre par défaut',

  roleSystemOwner: 'Propriétaire du système',
  roleLocationPartner: 'Partenaire de l’établissement',
  rolePharmacistInCharge: 'Pharmacien(ne) responsable',
  rolePharmacyTechnician: 'Technicien(ne) en pharmacie',
  roleCashier: 'Caissier(ère)',
  roleInventoryManager: 'Gestionnaire d’inventaire',
  roleAccountant: 'Comptable',
};

export const TRANSLATIONS: Record<Locale, Record<keyof typeof en, string>> = { en, fr };
export type TranslationKey = keyof typeof en;
