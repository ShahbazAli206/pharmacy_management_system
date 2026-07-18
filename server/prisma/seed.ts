import { ComplianceFrequency, DosageForm, DrugSchedule, PrismaClient, Province, RoleName } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_PERMISSIONS,
} from '../src/constants/permissions';

const prisma = new PrismaClient();

const ROLE_META: Record<RoleName, { description: string; isGlobal: boolean }> = {
  SYSTEM_OWNER: { description: 'Full access across all locations', isGlobal: true },
  LOCATION_PARTNER: { description: 'Full access to assigned pharmacy only', isGlobal: false },
  PHARMACIST_IN_CHARGE: { description: 'Prescriptions, patients, controlled substances', isGlobal: false },
  PHARMACY_TECHNICIAN: { description: 'Dispensing assist, inventory, patient view', isGlobal: false },
  CASHIER: { description: 'Sales only, no patient medical history', isGlobal: false },
  INVENTORY_MANAGER: { description: 'Stock and orders, no patient records', isGlobal: false },
  ACCOUNTANT: { description: 'Financial data only, no patient records', isGlobal: false },
};

// 16 pharmacies across several provinces with their regulatory bodies.
const REGULATOR: Partial<Record<Province, string>> = {
  ON: 'OCP', BC: 'CPBC', AB: 'ACP', MB: 'MPhA', SK: 'SCPP', QC: 'OPQ',
};

const PHARMACIES = [
  { province: 'ON', city: 'Toronto' }, { province: 'ON', city: 'Ottawa' },
  { province: 'ON', city: 'Mississauga' }, { province: 'ON', city: 'Hamilton' },
  { province: 'BC', city: 'Vancouver' }, { province: 'BC', city: 'Surrey' },
  { province: 'BC', city: 'Victoria' }, { province: 'AB', city: 'Calgary' },
  { province: 'AB', city: 'Edmonton' }, { province: 'AB', city: 'Red Deer' },
  { province: 'MB', city: 'Winnipeg' }, { province: 'SK', city: 'Regina' },
  { province: 'SK', city: 'Saskatoon' }, { province: 'QC', city: 'Montreal' },
  { province: 'QC', city: 'Quebec City' }, { province: 'QC', city: 'Laval' },
] as const;

async function seedPermissions() {
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  console.log(`Seeded ${Object.keys(PERMISSION_DESCRIPTIONS).length} permissions`);
}

async function seedRoles() {
  for (const roleName of Object.keys(ROLE_META) as RoleName[]) {
    const meta = ROLE_META[roleName];
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: meta.description, isGlobal: meta.isGlobal },
      create: { name: roleName, description: meta.description, isGlobal: meta.isGlobal },
    });

    // Reset and reassign this role's permission set from the matrix.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({
      where: { key: { in: ROLE_PERMISSIONS[roleName] } },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${Object.keys(ROLE_META).length} roles with permission matrix`);
}

async function seedPharmacies() {
  const created = [];
  for (let i = 0; i < PHARMACIES.length; i++) {
    const p = PHARMACIES[i];
    const code = `PH-${p.province}-${String(i + 1).padStart(3, '0')}`;
    const pharmacy = await prisma.pharmacy.upsert({
      where: { code },
      update: {},
      create: {
        name: `${p.city} Community Pharmacy`,
        code,
        province: p.province as Province,
        regulatoryBody: REGULATOR[p.province as Province] ?? 'N/A',
        addressLine1: `${100 + i} Main Street`,
        city: p.city,
        postalCode: 'A1A 1A1',
        phone: '000-000-0000',
      },
    });
    created.push(pharmacy);
  }
  console.log(`Seeded ${created.length} pharmacies`);
  return created;
}

async function seedUsers(pharmacyIds: string[]) {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SYSTEM_OWNER' } });
  const partnerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'LOCATION_PARTNER' } });
  const picRole = await prisma.role.findUniqueOrThrow({ where: { name: 'PHARMACIST_IN_CHARGE' } });

  // System owner — no pharmacy assignment (spans all locations).
  await prisma.user.upsert({
    where: { email: 'owner@pharmacy.ca' },
    update: {},
    create: {
      email: 'owner@pharmacy.ca',
      passwordHash,
      firstName: 'System',
      lastName: 'Owner',
      roleId: ownerRole.id,
      pharmacyId: null,
    },
  });

  // A partner + a PIC for the first location, as sample scoped users.
  await prisma.user.upsert({
    where: { email: 'partner1@pharmacy.ca' },
    update: {},
    create: {
      email: 'partner1@pharmacy.ca',
      passwordHash,
      firstName: 'Location',
      lastName: 'Partner',
      roleId: partnerRole.id,
      pharmacyId: pharmacyIds[0],
    },
  });

  await prisma.user.upsert({
    where: { email: 'pic1@pharmacy.ca' },
    update: {},
    create: {
      email: 'pic1@pharmacy.ca',
      passwordHash,
      firstName: 'Pharmacist',
      lastName: 'InCharge',
      roleId: picRole.id,
      pharmacyId: pharmacyIds[0],
      licenseNumber: 'OCP-123456',
    },
  });

  console.log('Seeded users: owner@pharmacy.ca, partner1@pharmacy.ca, pic1@pharmacy.ca (password: ChangeMe123!)');
}

interface SeedProduct {
  din: string;
  name: string;
  genericName?: string;
  strength: string;
  form: DosageForm;
  schedule: DrugSchedule;
  isControlled?: boolean;
  defaultPriceCents: number;
  interactionClasses: string;
}

const CATALOG: SeedProduct[] = [
  { din: '00000001', name: 'Warfarin', genericName: 'warfarin sodium', strength: '5 mg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 1200, interactionClasses: 'anticoagulant' },
  { din: '00000002', name: 'Ibuprofen', strength: '400 mg', form: 'TABLET', schedule: 'OTC', defaultPriceCents: 800, interactionClasses: 'nsaid' },
  { din: '00000003', name: 'Amoxicillin', strength: '500 mg', form: 'CAPSULE', schedule: 'SCHEDULE_I', defaultPriceCents: 1500, interactionClasses: 'penicillin,antibiotic' },
  { din: '00000004', name: 'Lorazepam', strength: '1 mg', form: 'TABLET', schedule: 'TARGETED', isControlled: true, defaultPriceCents: 2000, interactionClasses: 'benzodiazepine' },
  { din: '00000005', name: 'Acetaminophen', strength: '500 mg', form: 'TABLET', schedule: 'OTC', defaultPriceCents: 600, interactionClasses: 'analgesic' },
];

async function seedCatalogAndStock(firstPharmacyId: string) {
  const products: Record<string, string> = {};
  for (const p of CATALOG) {
    const created = await prisma.product.upsert({
      where: { din: p.din },
      update: {},
      create: {
        din: p.din,
        name: p.name,
        genericName: p.genericName ?? null,
        strength: p.strength,
        form: p.form,
        schedule: p.schedule,
        isControlled: p.isControlled ?? false,
        defaultPriceCents: p.defaultPriceCents,
        interactionClasses: p.interactionClasses,
      },
    });
    products[p.din] = created.id;
  }

  // A prescriber for the first location.
  const existingPrescriber = await prisma.prescriber.findFirst({
    where: { pharmacyId: firstPharmacyId, collegeRegNumber: 'CPSO-99887' },
  });
  if (!existingPrescriber) {
    await prisma.prescriber.create({
      data: {
        pharmacyId: firstPharmacyId,
        firstName: 'Dr. Alice',
        lastName: 'Nguyen',
        collegeRegNumber: 'CPSO-99887',
        phone: '416-555-0100',
      },
    });
  }

  // Stock a few products at the first location (skip if already stocked).
  for (const din of ['00000001', '00000002', '00000003']) {
    const item = await prisma.inventoryItem.upsert({
      where: { pharmacyId_productId: { pharmacyId: firstPharmacyId, productId: products[din] } },
      update: {},
      create: {
        pharmacyId: firstPharmacyId,
        productId: products[din],
        reorderThreshold: 20,
        reorderQuantity: 100,
      },
    });
    const hasLot = await prisma.stockLot.findFirst({ where: { inventoryItemId: item.id } });
    if (!hasLot) {
      await prisma.stockLot.create({
        data: {
          inventoryItemId: item.id,
          lotNumber: `LOT-${din}`,
          expiryDate: new Date('2027-01-01'),
          quantityOnHand: 200,
          unitCostCents: 500,
        },
      });
    }
  }

  console.log(`Seeded ${CATALOG.length} products, 1 prescriber, stock for 3 products at first location`);
}

interface TemplateSeed {
  key: string;
  title: string;
  frequency: ComplianceFrequency;
  timesPerDay?: number;
  requiresSignature?: boolean;
}

const TEMPLATES: TemplateSeed[] = [
  { key: 'narcotic_count', title: 'Narcotic count reconciliation', frequency: 'DAILY', timesPerDay: 2, requiresSignature: true },
  { key: 'fridge_temp', title: 'Refrigerator temperature log', frequency: 'DAILY', timesPerDay: 2 },
  { key: 'sharps_waste', title: 'Sharps & pharmaceutical waste disposal log', frequency: 'DAILY' },
  { key: 'counselling', title: 'Patient counselling documented for new Rx', frequency: 'DAILY' },
  { key: 'methadone_log', title: 'Methadone/Suboxone dispensing log', frequency: 'DAILY' },
  { key: 'expired_med_sweep', title: 'Expired medication shelf sweep', frequency: 'WEEKLY' },
  { key: 'inspection_readiness', title: 'Annual inspection readiness checklist', frequency: 'ANNUAL' },
];

async function seedComplianceTemplates() {
  for (const t of TEMPLATES) {
    await prisma.complianceTaskTemplate.upsert({
      where: { key: t.key },
      update: { title: t.title, frequency: t.frequency, timesPerDay: t.timesPerDay ?? 1, requiresSignature: t.requiresSignature ?? false },
      create: {
        key: t.key,
        title: t.title,
        frequency: t.frequency,
        timesPerDay: t.timesPerDay ?? 1,
        requiresSignature: t.requiresSignature ?? false,
      },
    });
  }
  console.log(`Seeded ${TEMPLATES.length} compliance task templates`);
}

async function seedExpiries(firstPharmacyId: string) {
  // Pharmacy permit expiring in ~45 days (triggers 60-day warning).
  const permit = new Date();
  permit.setDate(permit.getDate() + 45);
  await prisma.pharmacy.update({ where: { id: firstPharmacyId }, data: { permitExpiry: permit } });

  // PIC license expiring in ~25 days (triggers 30-day warning).
  const lic = new Date();
  lic.setDate(lic.getDate() + 25);
  await prisma.user.updateMany({ where: { email: 'pic1@pharmacy.ca' }, data: { licenseExpiry: lic } });
  console.log('Seeded sample permit + license expiries for the first location');
}

async function seedFinanceAndPlatform(firstPharmacyId: string) {
  const partner = await prisma.user.findUnique({ where: { email: 'partner1@pharmacy.ca' } });
  if (partner) {
    await prisma.partnerOwnership.upsert({
      where: { pharmacyId_userId: { pharmacyId: firstPharmacyId, userId: partner.id } },
      update: { basisPoints: 6000 },
      create: { pharmacyId: firstPharmacyId, userId: partner.id, partnerName: 'Location Partner', basisPoints: 6000 },
    });
  }

  const hasExpense = await prisma.expense.findFirst({ where: { pharmacyId: firstPharmacyId } });
  if (!hasExpense && partner) {
    const renewal = new Date();
    renewal.setDate(renewal.getDate() + 40);
    await prisma.expense.createMany({
      data: [
        { pharmacyId: firstPharmacyId, category: 'RENT_OCCUPANCY', description: 'Monthly base rent', amountCents: 850000, incurredOn: new Date(), status: 'APPROVED', submittedByUserId: partner.id, recurring: true, renewalDate: renewal, approvedByUserId: partner.id, approvedAt: new Date() },
        { pharmacyId: firstPharmacyId, category: 'UTILITIES', description: 'Hydro + gas', amountCents: 62000, taxCents: 8060, incurredOn: new Date(), status: 'SUBMITTED', submittedByUserId: partner.id },
      ],
    });
  }

  const hasCamera = await prisma.camera.findFirst({ where: { pharmacyId: firstPharmacyId } });
  if (!hasCamera) {
    await prisma.camera.createMany({
      data: [
        { pharmacyId: firstPharmacyId, label: 'Dispensing Counter', placement: 'dispensing counter', ipAddress: '192.168.1.10', status: 'ONLINE', lastSeenAt: new Date() },
        { pharmacyId: firstPharmacyId, label: 'Narcotics Safe', placement: 'safe/narcotics storage', ipAddress: '192.168.1.11', status: 'ONLINE', lastSeenAt: new Date() },
        { pharmacyId: firstPharmacyId, label: 'Entrance', placement: 'entrance/exit', ipAddress: '192.168.1.12', status: 'OFFLINE' },
      ],
    });
  }

  // Global feature flags.
  for (const key of ['ocr_scanning', 'insurance_adjudication', 'inter_pharmacy_transfers']) {
    const existing = await prisma.featureFlag.findFirst({ where: { key, pharmacyId: null } });
    if (!existing) await prisma.featureFlag.create({ data: { key, pharmacyId: null, enabled: false } });
  }
  console.log('Seeded partner ownership, expenses, cameras, and feature flags');
}

async function main() {
  await seedPermissions();
  await seedRoles();
  const pharmacies = await seedPharmacies();
  await seedUsers(pharmacies.map((p) => p.id));
  await seedCatalogAndStock(pharmacies[0].id);
  await seedComplianceTemplates();
  await seedExpiries(pharmacies[0].id);
  await seedFinanceAndPlatform(pharmacies[0].id);
  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
