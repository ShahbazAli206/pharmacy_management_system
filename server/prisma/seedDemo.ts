/**
 * Rich, cross-linked DEMO data for 3 locations (Toronto, Vancouver, Calgary).
 *
 * Additive and standalone — never touches the baseline `seed.ts` (CI/fresh-db
 * seed), which stays untouched. Run manually, NOT part of `prisma.seed` or CI:
 *
 *   DATABASE_URL=<superuser URL, same as DIRECT_URL> npm run db:seed:demo
 *
 * Requires `seed.ts` to have already run (pharmacies/roles/base users/base
 * catalog must exist). Uses a raw PrismaClient — same pattern as seed.ts —
 * because RLS `FORCE ROW LEVEL SECURITY` policies only yield to a Postgres
 * superuser; no `rlsStorage` context is needed here.
 *
 * Idempotent: every per-location block is gated on a "did we already seed
 * this?" check (a `customFields.seedDemo` JSON marker for Patient/Product, or
 * a natural dedupe key for everything else) and returns the EXISTING rows on
 * a repeat run instead of re-creating, so downstream steps still have what
 * they need.
 */
import {
  ComplianceStatus,
  AlertSeverity,
  AlertStatus,
  CountPeriod,
  CountStatus,
  DosageForm,
  DrugSchedule,
  ExpenseCategory,
  ExpenseStatus,
  Gender,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  MessageScope,
  NarcoticTxnType,
  NotificationChannel,
  NotificationStatus,
  PaymentMethod,
  PerformanceRating,
  PrescriptionStatus,
  PrismaClient,
  Province,
  QuarantineStatus,
  RecallRisk,
  ReviewStatus,
  SaleItemType,
  ShiftStatus,
  SignatureStatus,
  TrainingCategory,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptNullable } from '../src/utils/crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Small helpers (plain Node script — Date.now()/Math.random() are fine here)
// ---------------------------------------------------------------------------
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}
function yearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(randInt(1, 28));
  d.setMonth(randInt(0, 11));
  return d;
}

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas',
  'Mia', 'Benjamin', 'Charlotte', 'Henry', 'Amelia', 'Jack', 'Harper', 'Aiden', 'Ella', 'Owen',
];
const LAST_NAMES = [
  'Smith', 'Brown', 'Tremblay', 'Martin', 'Roy', 'Wilson', 'MacDonald', 'Taylor', 'Campbell',
  'Anderson', 'Chan', 'Singh', 'Nguyen', 'Kim', 'Patel', 'Gagnon', 'Bergeron', 'Cook', 'Clarke', 'Richard',
];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];
const ALLERGY_SUBSTANCES = ['Penicillin', 'Sulfa drugs', 'Peanuts', 'Latex', 'Aspirin', 'Codeine'];
const CONDITIONS = ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Hypothyroidism', 'Osteoarthritis'];

// ---------------------------------------------------------------------------
// 0. Context — resolve everything the baseline seed.ts already created
// ---------------------------------------------------------------------------
interface Ctx {
  toronto: { id: string; province: Province };
  vancouver: { id: string; province: Province };
  calgary: { id: string; province: Province };
  pharmacies: { id: string; province: Province }[];
  partner1: { id: string };
  pic1: { id: string };
  roles: { partner: { id: string }; pic: { id: string }; tech: { id: string }; cashier: { id: string } };
}

async function resolveContext(): Promise<Ctx> {
  const toronto = await prisma.pharmacy.findUniqueOrThrow({ where: { code: 'PH-ON-001' } });
  const vancouver = await prisma.pharmacy.findUniqueOrThrow({ where: { code: 'PH-BC-005' } });
  const calgary = await prisma.pharmacy.findUniqueOrThrow({ where: { code: 'PH-AB-008' } });

  const partner1 = await prisma.user.findUniqueOrThrow({ where: { email: 'partner1@pharmacy.ca' } });
  const pic1 = await prisma.user.findUniqueOrThrow({ where: { email: 'pic1@pharmacy.ca' } });

  const roles = {
    partner: await prisma.role.findUniqueOrThrow({ where: { name: 'LOCATION_PARTNER' } }),
    pic: await prisma.role.findUniqueOrThrow({ where: { name: 'PHARMACIST_IN_CHARGE' } }),
    tech: await prisma.role.findUniqueOrThrow({ where: { name: 'PHARMACY_TECHNICIAN' } }),
    cashier: await prisma.role.findUniqueOrThrow({ where: { name: 'CASHIER' } }),
  };

  return { toronto, vancouver, calgary, pharmacies: [toronto, vancouver, calgary], partner1, pic1, roles };
}

// ---------------------------------------------------------------------------
// 1. Staff users — fill out Vancouver/Calgary (currently bare shells) + round
//    out Toronto with a technician/cashier.
// ---------------------------------------------------------------------------
interface StaffSet {
  partner: { id: string };
  pic: { id: string };
  tech: { id: string };
  cashier: { id: string };
}

async function seedStaffUsers(ctx: Ctx): Promise<Record<string, StaffSet>> {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  async function upsertUser(
    email: string,
    firstName: string,
    lastName: string,
    roleId: string,
    pharmacyId: string,
    licenseNumber?: string,
    licenseExpiry?: Date,
  ) {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash, firstName, lastName, roleId, pharmacyId, licenseNumber, licenseExpiry },
    });
  }

  const tech1 = await upsertUser('tech1@pharmacy.ca', 'Priya', 'Sharma', ctx.roles.tech.id, ctx.toronto.id);
  const cashier1 = await upsertUser('cashier1@pharmacy.ca', 'Jordan', 'Lee', ctx.roles.cashier.id, ctx.toronto.id);

  const partner2 = await upsertUser('partner2@pharmacy.ca', 'Location', 'Partner', ctx.roles.partner.id, ctx.vancouver.id);
  const pic2 = await upsertUser('pic2@pharmacy.ca', 'Pharmacist', 'InCharge', ctx.roles.pic.id, ctx.vancouver.id, 'CPBC-220011', daysFromNow(90));
  const tech2 = await upsertUser('tech2@pharmacy.ca', 'Wei', 'Zhang', ctx.roles.tech.id, ctx.vancouver.id);
  const cashier2 = await upsertUser('cashier2@pharmacy.ca', 'Sara', 'Ahmed', ctx.roles.cashier.id, ctx.vancouver.id);

  const partner3 = await upsertUser('partner3@pharmacy.ca', 'Location', 'Partner', ctx.roles.partner.id, ctx.calgary.id);
  const pic3 = await upsertUser('pic3@pharmacy.ca', 'Pharmacist', 'InCharge', ctx.roles.pic.id, ctx.calgary.id, 'ACP-330022', daysFromNow(20));
  const tech3 = await upsertUser('tech3@pharmacy.ca', 'Marc', 'Tremblay', ctx.roles.tech.id, ctx.calgary.id);
  const cashier3 = await upsertUser('cashier3@pharmacy.ca', 'Amanda', 'Brown', ctx.roles.cashier.id, ctx.calgary.id);

  console.log('Seeded staff users: tech1/cashier1 (Toronto), partner2/pic2/tech2/cashier2 (Vancouver), partner3/pic3/tech3/cashier3 (Calgary) — password ChangeMe123!');

  return {
    [ctx.toronto.id]: { partner: ctx.partner1, pic: ctx.pic1, tech: tech1, cashier: cashier1 },
    [ctx.vancouver.id]: { partner: partner2, pic: pic2, tech: tech2, cashier: cashier2 },
    [ctx.calgary.id]: { partner: partner3, pic: pic3, tech: tech3, cashier: cashier3 },
  };
}

// ---------------------------------------------------------------------------
// 2. Catalog — extend the 5 base products with 10 more (incl. 2 controlled)
// ---------------------------------------------------------------------------
interface SeedProduct {
  din: string;
  name: string;
  strength: string;
  form: DosageForm;
  schedule: DrugSchedule;
  isControlled?: boolean;
  defaultPriceCents: number;
  interactionClasses: string;
}

const EXTRA_CATALOG: SeedProduct[] = [
  { din: '00000006', name: 'Metformin', strength: '500 mg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 900, interactionClasses: 'biguanide' },
  { din: '00000007', name: 'Atorvastatin', strength: '20 mg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 1400, interactionClasses: 'statin' },
  { din: '00000008', name: 'Amlodipine', strength: '5 mg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 1100, interactionClasses: 'calcium_channel_blocker' },
  { din: '00000009', name: 'Salbutamol', strength: '100 mcg', form: 'INHALER', schedule: 'SCHEDULE_I', defaultPriceCents: 2500, interactionClasses: 'bronchodilator' },
  { din: '00000010', name: 'Levothyroxine', strength: '50 mcg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 1000, interactionClasses: 'thyroid_hormone' },
  { din: '00000011', name: 'Pantoprazole', strength: '40 mg', form: 'TABLET', schedule: 'SCHEDULE_I', defaultPriceCents: 1300, interactionClasses: 'ppi' },
  { din: '00000012', name: 'Cetirizine', strength: '10 mg', form: 'TABLET', schedule: 'OTC', defaultPriceCents: 700, interactionClasses: 'antihistamine' },
  { din: '00000013', name: 'Vitamin D3', strength: '1000 IU', form: 'TABLET', schedule: 'OTC', defaultPriceCents: 500, interactionClasses: 'supplement' },
  { din: '00000014', name: 'Codeine', strength: '30 mg', form: 'TABLET', schedule: 'NARCOTIC', isControlled: true, defaultPriceCents: 1800, interactionClasses: 'opioid' },
  { din: '00000015', name: 'Morphine', strength: '10 mg', form: 'TABLET', schedule: 'NARCOTIC', isControlled: true, defaultPriceCents: 3000, interactionClasses: 'opioid' },
];

interface ProductInfo {
  id: string;
  din: string;
  name: string;
  strength: string;
  form: DosageForm;
  isControlled: boolean;
  defaultPriceCents: number;
}

async function seedCatalogExtra(): Promise<Record<string, ProductInfo>> {
  const products: Record<string, ProductInfo> = {};

  const base = await prisma.product.findMany({
    where: { din: { in: ['00000001', '00000002', '00000003', '00000004', '00000005'] } },
  });
  for (const p of base) {
    products[p.din] = { id: p.id, din: p.din, name: p.name, strength: p.strength, form: p.form, isControlled: p.isControlled, defaultPriceCents: p.defaultPriceCents };
  }

  for (const p of EXTRA_CATALOG) {
    const created = await prisma.product.upsert({
      where: { din: p.din },
      update: {},
      create: {
        din: p.din,
        name: p.name,
        strength: p.strength,
        form: p.form,
        schedule: p.schedule,
        isControlled: p.isControlled ?? false,
        defaultPriceCents: p.defaultPriceCents,
        interactionClasses: p.interactionClasses,
      },
    });
    products[p.din] = {
      id: created.id, din: created.din, name: created.name, strength: created.strength,
      form: created.form, isControlled: created.isControlled, defaultPriceCents: created.defaultPriceCents,
    };
  }

  console.log(`Seeded ${EXTRA_CATALOG.length} additional products (${Object.keys(products).length} total in catalog)`);
  return products;
}

// ---------------------------------------------------------------------------
// 3. Prescribers — one more for Toronto, two each for Vancouver/Calgary
// ---------------------------------------------------------------------------
async function seedPrescribers(ctx: Ctx): Promise<Record<string, { id: string }[]>> {
  const specs = [
    { pharmacyId: ctx.toronto.id, firstName: 'Dr. Michael', lastName: 'Osei', collegeRegNumber: 'CPSO-88221', phone: '416-555-0142' },
    { pharmacyId: ctx.vancouver.id, firstName: 'Dr. Emily', lastName: 'Chow', collegeRegNumber: 'CPSBC-11029', phone: '604-555-0110' },
    { pharmacyId: ctx.vancouver.id, firstName: 'Dr. Raj', lastName: 'Patel', collegeRegNumber: 'CPSBC-11030', phone: '604-555-0111' },
    { pharmacyId: ctx.calgary.id, firstName: 'Dr. Laura', lastName: 'Bennett', collegeRegNumber: 'CPSA-22011', phone: '403-555-0120' },
    { pharmacyId: ctx.calgary.id, firstName: 'Dr. Samir', lastName: 'Haddad', collegeRegNumber: 'CPSA-22012', phone: '403-555-0121' },
  ];

  const byPharmacy: Record<string, { id: string }[]> = {
    [ctx.toronto.id]: (await prisma.prescriber.findMany({ where: { pharmacyId: ctx.toronto.id } })).map((p) => ({ id: p.id })),
    [ctx.vancouver.id]: [],
    [ctx.calgary.id]: [],
  };

  for (const s of specs) {
    let p = await prisma.prescriber.findFirst({ where: { pharmacyId: s.pharmacyId, collegeRegNumber: s.collegeRegNumber } });
    if (!p) p = await prisma.prescriber.create({ data: s });
    byPharmacy[s.pharmacyId].push({ id: p.id });
  }

  console.log('Seeded prescribers: +1 Toronto, +2 Vancouver, +2 Calgary');
  return byPharmacy;
}

// ---------------------------------------------------------------------------
// 4. Patients (+ allergies/conditions) — ~10 per location, JSON-marker gated
// ---------------------------------------------------------------------------
interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
}

async function seedPatients(ctx: Ctx): Promise<Record<string, PatientInfo[]>> {
  const byPharmacy: Record<string, PatientInfo[]> = {};

  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.patient.findMany({
      where: { pharmacyId: pharmacy.id, customFields: { path: ['seedDemo'], equals: true } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existing.length > 0) {
      byPharmacy[pharmacy.id] = existing;
      continue;
    }

    const created: PatientInfo[] = [];
    for (let i = 0; i < 10; i++) {
      const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
      const hasHealthCard = Math.random() < 0.7;
      const patient = await prisma.patient.create({
        data: {
          pharmacyId: pharmacy.id,
          firstName,
          lastName,
          dateOfBirth: yearsAgo(randInt(19, 82)),
          gender: pick(GENDERS),
          phone: `${randInt(200, 900)}-555-${String(randInt(0, 9999)).padStart(4, '0')}`,
          email: hasHealthCard ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.ca` : null,
          healthCardEnc: hasHealthCard ? encryptNullable(`${pharmacy.province}${randInt(1000000000, 9999999999)}`) : null,
          insurancePlanEnc: hasHealthCard ? encryptNullable(`PLAN-${randInt(10000, 99999)}`) : null,
          smsOptIn: Math.random() < 0.5,
          emailOptIn: Math.random() < 0.5,
          customFields: { seedDemo: true },
        },
      });

      const allergyCount = randInt(0, 2);
      for (let a = 0; a < allergyCount; a++) {
        await prisma.allergy.create({
          data: { patientId: patient.id, substance: pick(ALLERGY_SUBSTANCES), severity: pick(['LOW', 'MODERATE', 'HIGH', 'SEVERE']) },
        });
      }
      const conditionCount = randInt(0, 2);
      for (let c = 0; c < conditionCount; c++) {
        await prisma.chronicCondition.create({ data: { patientId: patient.id, name: pick(CONDITIONS) } });
      }

      created.push({ id: patient.id, firstName, lastName });
    }
    byPharmacy[pharmacy.id] = created;
  }

  console.log(`Seeded patients for ${ctx.pharmacies.length} locations (~10 each, with allergies/conditions)`);
  return byPharmacy;
}

// ---------------------------------------------------------------------------
// 5. Suppliers, inventory, stock lots — deliberate expiry/low-stock spread
// ---------------------------------------------------------------------------
interface LotInfo {
  id: string;
  din: string;
  expiryDate: Date | null;
}

async function seedSuppliersAndInventory(
  ctx: Ctx,
  products: Record<string, ProductInfo>,
): Promise<Record<string, LotInfo[]>> {
  const lotsByPharmacy: Record<string, LotInfo[]> = {};
  const dinsToStock = Object.keys(products); // stock the full catalog everywhere

  for (const pharmacy of ctx.pharmacies) {
    let supplier = await prisma.supplier.findFirst({ where: { pharmacyId: pharmacy.id, name: 'McKesson Canada' } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: { pharmacyId: pharmacy.id, name: 'McKesson Canada', contactName: 'Order Desk', phone: '1-800-555-0100', leadTimeDays: 3 },
      });
    }

    const lots: LotInfo[] = [];
    for (let i = 0; i < dinsToStock.length; i++) {
      const din = dinsToStock[i];
      const product = products[din];

      const item = await prisma.inventoryItem.upsert({
        where: { pharmacyId_productId: { pharmacyId: pharmacy.id, productId: product.id } },
        update: {},
        create: { pharmacyId: pharmacy.id, productId: product.id, reorderThreshold: 20, reorderQuantity: 100, supplierId: supplier.id },
      });

      const hasLots = await prisma.stockLot.findFirst({ where: { inventoryItemId: item.id } });
      if (hasLots) {
        const allLots = await prisma.stockLot.findMany({ where: { inventoryItemId: item.id } });
        lots.push(...allLots.map((l) => ({ id: l.id, din, expiryDate: l.expiryDate })));
        continue;
      }

      // Deliberate spread: expiry buckets + a couple of under-stocked items.
      const bucket = i % 5; // 0=expired-soon(20d) 1=30-60d 2=60-90d 3=far future 4=far future
      const expiryDays = bucket === 0 ? 25 : bucket === 1 ? 50 : bucket === 2 ? 80 : 400;
      const lowStock = i % 7 === 0; // ~2 items per location under reorder threshold
      const lot = await prisma.stockLot.create({
        data: {
          inventoryItemId: item.id,
          lotNumber: `LOT-${pharmacy.id.slice(0, 4)}-${din}`,
          expiryDate: daysFromNow(expiryDays),
          quantityOnHand: lowStock ? randInt(1, 15) : randInt(50, 250),
          unitCostCents: Math.round(product.defaultPriceCents * 0.4),
        },
      });
      lots.push({ id: lot.id, din, expiryDate: lot.expiryDate });
    }
    lotsByPharmacy[pharmacy.id] = lots;
  }

  console.log('Seeded suppliers + full-catalog inventory with expiry/low-stock spread for all 3 locations');
  return lotsByPharmacy;
}

// ---------------------------------------------------------------------------
// 6. Prescriptions + dispensing records
// ---------------------------------------------------------------------------
interface ControlledDispenseEvent {
  pharmacyId: string;
  productId: string;
  din: string;
  quantity: number;
  performedByUserId: string;
  dispensedAt: Date;
  dispensingRecordId: string;
}

async function seedPrescriptionsAndDispensing(
  ctx: Ctx,
  staffByPharmacy: Record<string, StaffSet>,
  products: Record<string, ProductInfo>,
  patientsByPharmacy: Record<string, PatientInfo[]>,
  prescribersByPharmacy: Record<string, { id: string }[]>,
  lotsByPharmacy: Record<string, LotInfo[]>,
): Promise<ControlledDispenseEvent[]> {
  const controlledEvents: ControlledDispenseEvent[] = [];
  const dins = Object.keys(products);
  const statuses: PrescriptionStatus[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.prescription.findFirst({ where: { pharmacyId: pharmacy.id, directions: 'SEED_DEMO_MARKER' } });
    if (existing) continue; // already seeded this location

    const staff = staffByPharmacy[pharmacy.id];
    const patients = patientsByPharmacy[pharmacy.id];
    const prescribers = prescribersByPharmacy[pharmacy.id];
    const lots = lotsByPharmacy[pharmacy.id];

    for (let i = 0; i < 12; i++) {
      const din = dins[randInt(0, dins.length - 1)];
      const product = products[din];
      const patient = pick(patients);
      const prescriber = pick(prescribers);
      const status = pick(statuses);
      const refillsAuthorized = randInt(0, 5);
      const refillsUsed = status === 'COMPLETED' ? refillsAuthorized : randInt(0, refillsAuthorized);

      const prescription = await prisma.prescription.create({
        data: {
          pharmacyId: pharmacy.id,
          patientId: patient.id,
          prescriberId: prescriber.id,
          productId: product.id,
          din: product.din,
          drugName: product.name,
          strength: product.strength,
          form: product.form,
          directions: i === 0 ? 'SEED_DEMO_MARKER' : `Take 1 ${product.form.toLowerCase()} by mouth ${pick(['once daily', 'twice daily', 'as needed'])}`,
          quantity: randInt(30, 90),
          refillsAuthorized,
          refillsUsed,
          isControlled: product.isControlled,
          status,
          createdByUserId: staff.pic.id,
        },
      });

      if (status === 'ACTIVE' || status === 'COMPLETED') {
        const lot = lots.find((l) => l.din === din);
        const dispQty = randInt(10, Math.min(30, prescription.quantity));
        const dispensedAt = daysFromNow(-randInt(1, 25));
        const dispensing = await prisma.dispensingRecord.create({
          data: {
            prescriptionId: prescription.id,
            pharmacistUserId: staff.pic.id,
            dispensedAt,
            quantity: dispQty,
            dinDispensed: product.din,
            lotNumber: `LOT-${pharmacy.id.slice(0, 4)}-${din}`,
            expiryDate: lot?.expiryDate ?? undefined,
            stockLotId: lot?.id,
            counsellingNotes: Math.random() < 0.3 ? 'Counselled patient on dosage and side effects.' : undefined,
          },
        });

        if (product.isControlled) {
          controlledEvents.push({
            pharmacyId: pharmacy.id,
            productId: product.id,
            din: product.din,
            quantity: dispQty,
            performedByUserId: staff.pic.id,
            dispensedAt,
            dispensingRecordId: dispensing.id,
          });
        }
      }
    }
  }

  console.log('Seeded ~12 prescriptions (+ dispensing records) per location');
  return controlledEvents;
}

// ---------------------------------------------------------------------------
// 7. Sales (POS) — spread over the last 30 days
// ---------------------------------------------------------------------------
async function seedSales(
  ctx: Ctx,
  staffByPharmacy: Record<string, StaffSet>,
  products: Record<string, ProductInfo>,
  patientsByPharmacy: Record<string, PatientInfo[]>,
): Promise<void> {
  const TAX_RATE: Record<Province, number> = {
    ON: 0.13, BC: 0.12, AB: 0.05, MB: 0.12, SK: 0.11, QC: 0.14975,
    NS: 0.15, NB: 0.15, NL: 0.15, PE: 0.15, NT: 0.05, YT: 0.05, NU: 0.05,
  };
  const paymentMethods: PaymentMethod[] = ['CASH', 'DEBIT', 'CREDIT', 'INSURANCE'];
  const dins = Object.keys(products);

  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.sale.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (existing) continue;

    const staff = staffByPharmacy[pharmacy.id];
    const patients = patientsByPharmacy[pharmacy.id];
    const rate = TAX_RATE[pharmacy.province] ?? 0.13;

    for (let i = 0; i < 25; i++) {
      const daysAgo = randInt(0, 29);
      const createdAt = daysFromNow(-daysAgo);
      const lineCount = randInt(1, 3);
      const linked = Math.random() < 0.5;
      let subtotal = 0;
      let taxable = 0;
      const lines: { itemType: SaleItemType; description: string; productId?: string; quantity: number; unitPriceCents: number; lineTotalCents: number; taxable: boolean }[] = [];

      for (let l = 0; l < lineCount; l++) {
        const din = pick(dins);
        const product = products[din];
        const isRx = product.isControlled || Math.random() < 0.3;
        const qty = randInt(1, 3);
        const unitPrice = product.defaultPriceCents;
        const lineTotal = unitPrice * qty;
        const lineTaxable = !isRx;
        lines.push({
          itemType: isRx ? 'RX' : 'OTC',
          description: `${product.name} ${product.strength}`,
          productId: product.id,
          quantity: qty,
          unitPriceCents: unitPrice,
          lineTotalCents: lineTotal,
          taxable: lineTaxable,
        });
        subtotal += lineTotal;
        if (lineTaxable) taxable += lineTotal;
      }

      const tax = Math.round(taxable * rate);
      await prisma.sale.create({
        data: {
          pharmacyId: pharmacy.id,
          cashierUserId: staff.cashier.id,
          patientId: linked ? pick(patients).id : undefined,
          province: pharmacy.province,
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: subtotal + tax,
          paymentMethod: pick(paymentMethods),
          createdAt,
          lines: { create: lines },
        },
      });
    }
  }

  console.log('Seeded ~25 POS sales (with line items) per location, spread over the last 30 days');
}

// ---------------------------------------------------------------------------
// 8. Narcotics — coherent running-balance ledger + ONE balanced count each
//    (deliberately never an unresolved DISCREPANCY — that's an app-layer
//    invariant with lock/alert side effects a raw-DB seed shouldn't trigger).
// ---------------------------------------------------------------------------
async function seedNarcotics(
  ctx: Ctx,
  staffByPharmacy: Record<string, StaffSet>,
  products: Record<string, ProductInfo>,
  controlledEvents: ControlledDispenseEvent[],
): Promise<void> {
  const controlledDins = Object.values(products).filter((p) => p.isControlled).map((p) => p.din);

  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.narcoticTxn.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (existing) continue;

    const staff = staffByPharmacy[pharmacy.id];

    for (const din of controlledDins) {
      const product = products[din];
      const eventsForProduct = controlledEvents
        .filter((e) => e.pharmacyId === pharmacy.id && e.din === din)
        .sort((a, b) => a.dispensedAt.getTime() - b.dispensedAt.getTime());

      let balance = 100;
      await prisma.narcoticTxn.create({
        data: {
          pharmacyId: pharmacy.id,
          productId: product.id,
          type: 'RECEIPT',
          quantityChange: 100,
          balanceAfter: balance,
          referenceType: 'PurchaseOrder',
          performedByUserId: staff.pic.id,
          createdAt: daysFromNow(-28),
        },
      });

      for (const ev of eventsForProduct) {
        balance -= ev.quantity;
        await prisma.narcoticTxn.create({
          data: {
            pharmacyId: pharmacy.id,
            productId: product.id,
            type: 'DISPENSE',
            quantityChange: -ev.quantity,
            balanceAfter: balance,
            referenceType: 'DispensingRecord',
            referenceId: ev.dispensingRecordId,
            performedByUserId: ev.performedByUserId,
            createdAt: ev.dispensedAt,
          },
        });
      }

      await prisma.narcoticCount.create({
        data: {
          pharmacyId: pharmacy.id,
          productId: product.id,
          period: 'CLOSING',
          countedQuantity: balance,
          expectedQuantity: balance,
          discrepancy: 0,
          status: 'BALANCED',
          countedByUserId: staff.pic.id,
        },
      });
    }
  }

  console.log('Seeded narcotics ledgers (RECEIPT + DISPENSE) and one balanced count per controlled product per location');
}

// ---------------------------------------------------------------------------
// 9. Compliance — past week's checklist history + a couple of open alerts
// ---------------------------------------------------------------------------
async function seedCompliance(ctx: Ctx, staffByPharmacy: Record<string, StaffSet>): Promise<void> {
  const templates = await prisma.complianceTaskTemplate.findMany();

  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.complianceRecord.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (existing) continue;

    const staff = staffByPharmacy[pharmacy.id];
    const overdueRecordIds: string[] = [];

    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const dueDate = daysFromNow(-dayOffset);
      dueDate.setHours(0, 0, 0, 0);

      for (const template of templates) {
        if (template.frequency !== 'DAILY' && dayOffset !== 0) continue; // weekly/annual: only today's instance

        const slots = template.frequency === 'DAILY' ? Array.from({ length: template.timesPerDay }, (_, i) => i) : [0];
        for (const slot of slots) {
          const isToday = dayOffset === 0;
          const isRecentOverdue = dayOffset === 1 && slot === 0;
          const status: ComplianceStatus = isToday ? 'PENDING' : isRecentOverdue ? 'OVERDUE' : 'COMPLETED';

          const record = await prisma.complianceRecord.upsert({
            where: { pharmacyId_templateId_dueDate_slot: { pharmacyId: pharmacy.id, templateId: template.id, dueDate, slot } },
            update: {},
            create: {
              pharmacyId: pharmacy.id,
              templateId: template.id,
              dueDate,
              slot,
              label: template.title,
              status,
              completedByUserId: status === 'COMPLETED' ? staff.pic.id : undefined,
              completedAt: status === 'COMPLETED' ? dueDate : undefined,
              signature: status === 'COMPLETED' && template.requiresSignature ? `${staff.pic.id.slice(0, 8)}-sig` : undefined,
            },
          });
          if (status === 'OVERDUE') overdueRecordIds.push(record.id);
        }
      }
    }

    for (const recordId of overdueRecordIds.slice(0, 2)) {
      const already = await prisma.complianceAlert.findFirst({ where: { pharmacyId: pharmacy.id, relatedId: recordId } });
      if (already) continue;
      await prisma.complianceAlert.create({
        data: {
          pharmacyId: pharmacy.id,
          type: 'OVERDUE_TASK',
          severity: 'WARNING',
          message: 'A compliance task is overdue and needs attention.',
          status: 'OPEN',
          relatedType: 'ComplianceRecord',
          relatedId: recordId,
        },
      });
    }
  }

  console.log('Seeded 7 days of compliance checklist history + open alerts per location');
}

// ---------------------------------------------------------------------------
// 10. Drug recall + quarantine
// ---------------------------------------------------------------------------
async function seedRecallsAndQuarantine(ctx: Ctx, products: Record<string, ProductInfo>): Promise<void> {
  const target = products['00000003']; // Amoxicillin — stocked everywhere
  const recall = await prisma.drugRecall.upsert({
    where: { recallNumber: 'RA-2026-0001' },
    update: {},
    create: {
      recallNumber: 'RA-2026-0001',
      din: target.din,
      productName: target.name,
      reason: 'Potential contamination identified during routine quality testing.',
      risk: 'TYPE_II',
      publishedAt: daysFromNow(-5),
    },
  });

  for (const pharmacy of [ctx.vancouver, ctx.calgary]) {
    const item = await prisma.inventoryItem.findUnique({ where: { pharmacyId_productId: { pharmacyId: pharmacy.id, productId: target.id } } });
    const lot = item ? await prisma.stockLot.findFirst({ where: { inventoryItemId: item.id } }) : null;
    await prisma.quarantineRecord.upsert({
      where: { pharmacyId_recallId_productId: { pharmacyId: pharmacy.id, recallId: recall.id, productId: target.id } },
      update: {},
      create: {
        pharmacyId: pharmacy.id,
        recallId: recall.id,
        productId: target.id,
        status: 'QUARANTINED',
        quantityAffected: lot?.quantityOnHand ?? 10,
      },
    });
  }

  console.log('Seeded 1 drug recall + quarantine records at Vancouver and Calgary');
}

// ---------------------------------------------------------------------------
// 11. Finance — expenses/budgets/partner ownership for Vancouver & Calgary
// ---------------------------------------------------------------------------
async function seedFinance(ctx: Ctx, staffByPharmacy: Record<string, StaffSet>): Promise<void> {
  const categories: ExpenseCategory[] = ['RENT_OCCUPANCY', 'UTILITIES', 'PAYROLL', 'INSURANCE', 'MARKETING'];
  const expStatuses: ExpenseStatus[] = ['APPROVED', 'SUBMITTED', 'PAID', 'DRAFT', 'APPROVED'];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  for (const pharmacy of [ctx.vancouver, ctx.calgary]) {
    const staff = staffByPharmacy[pharmacy.id];

    await prisma.partnerOwnership.upsert({
      where: { pharmacyId_userId: { pharmacyId: pharmacy.id, userId: staff.partner.id } },
      update: {},
      create: { pharmacyId: pharmacy.id, userId: staff.partner.id, partnerName: 'Location Partner', basisPoints: 6000 },
    });

    const hasExpense = await prisma.expense.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasExpense) {
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const status = expStatuses[i];
        const renewal = category === 'RENT_OCCUPANCY' || category === 'INSURANCE' ? daysFromNow(randInt(20, 60)) : undefined;
        await prisma.expense.create({
          data: {
            pharmacyId: pharmacy.id,
            category,
            description: `${category.replace(/_/g, ' ').toLowerCase()} expense`,
            amountCents: randInt(20000, 850000),
            taxCents: randInt(0, 8000),
            incurredOn: daysFromNow(-randInt(1, 55)),
            status,
            submittedByUserId: staff.partner.id,
            recurring: !!renewal,
            renewalDate: renewal,
            approvedByUserId: status === 'APPROVED' || status === 'PAID' ? staff.partner.id : undefined,
            approvedAt: status === 'APPROVED' || status === 'PAID' ? new Date() : undefined,
          },
        });
      }
    }

    for (const category of ['RENT_OCCUPANCY', 'PAYROLL'] as ExpenseCategory[]) {
      await prisma.budget.upsert({
        where: { pharmacyId_category_month: { pharmacyId: pharmacy.id, category, month: monthStart } },
        update: {},
        create: { pharmacyId: pharmacy.id, category, month: monthStart, amountCents: randInt(500000, 900000) },
      });
    }
  }

  console.log('Seeded expenses/budgets/partner ownership for Vancouver and Calgary');
}

// ---------------------------------------------------------------------------
// 12. Stock transfers between the 3 locations
// ---------------------------------------------------------------------------
async function seedTransfers(
  ctx: Ctx,
  staffByPharmacy: Record<string, StaffSet>,
  products: Record<string, ProductInfo>,
): Promise<void> {
  const existing = await prisma.stockTransfer.findFirst({
    where: { OR: [{ fromPharmacyId: ctx.vancouver.id }, { fromPharmacyId: ctx.toronto.id, toPharmacyId: ctx.vancouver.id }] },
  });
  if (existing) return;

  const product = products['00000002']; // Ibuprofen — OTC, simple

  await prisma.stockTransfer.create({
    data: {
      fromPharmacyId: ctx.vancouver.id,
      toPharmacyId: ctx.calgary.id,
      productId: product.id,
      quantity: 30,
      status: 'REQUESTED',
      requestedByUserId: staffByPharmacy[ctx.vancouver.id].partner.id,
    },
  });

  await prisma.stockTransfer.create({
    data: {
      fromPharmacyId: ctx.toronto.id,
      toPharmacyId: ctx.vancouver.id,
      productId: product.id,
      quantity: 20,
      status: 'APPROVED',
      requestedByUserId: staffByPharmacy[ctx.toronto.id].partner.id,
      approvedByUserId: staffByPharmacy[ctx.toronto.id].partner.id,
    },
  });

  console.log('Seeded 2 stock transfers (1 requested, 1 approved) between locations');
}

// ---------------------------------------------------------------------------
// 13. Messages + notifications
// ---------------------------------------------------------------------------
async function seedMessagingAndNotifications(
  ctx: Ctx,
  staffByPharmacy: Record<string, StaffSet>,
  patientsByPharmacy: Record<string, PatientInfo[]>,
): Promise<void> {
  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.message.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!existing) {
      const staff = staffByPharmacy[pharmacy.id];
      await prisma.message.create({
        data: {
          senderUserId: staff.partner.id,
          senderName: 'Location Partner',
          scope: 'LOCATION',
          pharmacyId: pharmacy.id,
          subject: 'Fridge temperature check',
          body: 'Reminder: log the fridge temperature at open and close today.',
        },
      });
      await prisma.message.create({
        data: {
          senderUserId: staff.pic.id,
          senderName: 'Pharmacist InCharge',
          scope: 'LOCATION',
          pharmacyId: pharmacy.id,
          subject: 'Narcotic count',
          body: 'Please complete the closing narcotic count before end of shift.',
        },
      });
    }

    const patients = patientsByPharmacy[pharmacy.id];
    const hasNotifications = await prisma.notification.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasNotifications) {
      const channels: NotificationChannel[] = ['SMS', 'EMAIL', 'PUSH', 'IN_APP'];
      const statuses: NotificationStatus[] = ['SENT', 'SENT', 'PENDING', 'FAILED'];
      for (let i = 0; i < 4; i++) {
        const status = statuses[i];
        await prisma.notification.create({
          data: {
            pharmacyId: pharmacy.id,
            recipientUserId: undefined,
            patientId: pick(patients).id,
            channel: channels[i],
            type: 'REFILL_REMINDER',
            subject: 'Refill reminder',
            message: 'Your prescription is due for refill.',
            status,
            sentAt: status === 'SENT' ? daysFromNow(-randInt(1, 5)) : undefined,
            error: status === 'FAILED' ? 'Invalid phone number on file' : undefined,
          },
        });
      }
    }
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@pharmacy.ca' } });
  const hasBroadcast = await prisma.message.findFirst({ where: { scope: 'BROADCAST' } });
  if (!hasBroadcast) {
    await prisma.message.create({
      data: {
        senderUserId: owner.id,
        senderName: 'System Owner',
        scope: 'BROADCAST',
        pharmacyId: null,
        subject: 'Policy update',
        body: 'Updated CDSA counting procedure takes effect next week — see the Documents page.',
      },
    });
  }

  console.log('Seeded messages (per-location + 1 broadcast) and refill-reminder notifications');
}

// ---------------------------------------------------------------------------
// 14. Cameras — round out Vancouver/Calgary (Toronto already has 3)
// ---------------------------------------------------------------------------
async function seedCameras(ctx: Ctx): Promise<void> {
  for (const pharmacy of [ctx.vancouver, ctx.calgary]) {
    const existing = await prisma.camera.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (existing) continue;
    await prisma.camera.createMany({
      data: [
        { pharmacyId: pharmacy.id, label: 'Dispensing Counter', placement: 'dispensing counter', ipAddress: '192.168.2.10', status: 'ONLINE', lastSeenAt: new Date() },
        { pharmacyId: pharmacy.id, label: 'Narcotics Safe', placement: 'safe/narcotics storage', ipAddress: '192.168.2.11', status: 'ONLINE', lastSeenAt: new Date() },
        { pharmacyId: pharmacy.id, label: 'Entrance', placement: 'entrance/exit', ipAddress: '192.168.2.12', status: 'OFFLINE' },
      ],
    });
  }
  console.log('Seeded cameras for Vancouver and Calgary');
}

// ---------------------------------------------------------------------------
// 15. HR — attendance, shifts, incidents, training, performance reviews
// ---------------------------------------------------------------------------
async function seedHR(ctx: Ctx, staffByPharmacy: Record<string, StaffSet>): Promise<void> {
  for (const pharmacy of ctx.pharmacies) {
    const staff = staffByPharmacy[pharmacy.id];
    const staffList = [staff.partner, staff.pic, staff.tech, staff.cashier];

    const hasAttendance = await prisma.attendance.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasAttendance) {
      for (const s of staffList) {
        for (let d = 1; d <= 5; d++) {
          const clockIn = daysFromNow(-d);
          clockIn.setHours(9, 0, 0, 0);
          const clockOut = new Date(clockIn);
          clockOut.setHours(17, 0, 0, 0);
          await prisma.attendance.create({ data: { userId: s.id, pharmacyId: pharmacy.id, clockInAt: clockIn, clockOutAt: clockOut } });
        }
      }
    }

    const hasShifts = await prisma.shift.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasShifts) {
      for (const s of staffList) {
        for (let d = 1; d <= 3; d++) {
          const start = daysFromNow(d);
          start.setHours(9, 0, 0, 0);
          const end = new Date(start);
          end.setHours(17, 0, 0, 0);
          await prisma.shift.create({
            data: { userId: s.id, pharmacyId: pharmacy.id, startAt: start, endAt: end, role: 'Pharmacy staff', status: d === 1 ? 'PUBLISHED' : 'SCHEDULED', createdById: staff.partner.id },
          });
        }
      }
    }

    const hasIncidents = await prisma.incidentReport.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasIncidents) {
      await prisma.incidentReport.create({
        data: {
          pharmacyId: pharmacy.id,
          reportedByUserId: staff.tech.id,
          category: 'WORKPLACE_SAFETY' as IncidentCategory,
          severity: 'LOW' as IncidentSeverity,
          occurredAt: daysFromNow(-10),
          description: 'Wet floor near the dispensing counter after mopping; caution sign placed.',
          status: 'RESOLVED' as IncidentStatus,
          resolvedByUserId: staff.pic.id,
          resolvedAt: daysFromNow(-9),
        },
      });
      await prisma.incidentReport.create({
        data: {
          pharmacyId: pharmacy.id,
          reportedByUserId: staff.cashier.id,
          category: 'PATIENT_COMPLAINT' as IncidentCategory,
          severity: 'MEDIUM' as IncidentSeverity,
          occurredAt: daysFromNow(-3),
          description: 'Patient reported a long wait time during a busy period.',
          status: 'OPEN' as IncidentStatus,
        },
      });
    }

    const hasTraining = await prisma.trainingRecord.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasTraining) {
      for (const s of staffList) {
        await prisma.trainingRecord.create({
          data: {
            userId: s.id,
            pharmacyId: pharmacy.id,
            title: 'Naloxone administration course',
            category: 'CONTINUING_EDUCATION' as TrainingCategory,
            creditHours: 2,
            completedAt: daysFromNow(-randInt(30, 300)),
            expiresAt: s.id === staff.pic.id ? daysFromNow(20) : daysFromNow(randInt(200, 600)),
            recordedByUserId: staff.pic.id,
          },
        });
      }
    }

    const hasReviews = await prisma.performanceReview.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (!hasReviews) {
      for (const s of [staff.tech, staff.cashier]) {
        const periodStart = daysFromNow(-90);
        const periodEnd = daysFromNow(0);
        await prisma.performanceReview.create({
          data: {
            userId: s.id,
            pharmacyId: pharmacy.id,
            reviewerUserId: staff.pic.id,
            periodStart,
            periodEnd,
            rating: pick(['MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS'] as PerformanceRating[]),
            strengths: 'Reliable, good attention to detail with patient counselling.',
            status: 'ACKNOWLEDGED' as ReviewStatus,
            acknowledgedAt: new Date(),
          },
        });
      }
    }
  }

  console.log('Seeded attendance, shifts, incident reports, training records, and performance reviews per location');
}

// ---------------------------------------------------------------------------
// 16. Documents + signature requests
// ---------------------------------------------------------------------------
async function seedDocuments(ctx: Ctx, staffByPharmacy: Record<string, StaffSet>): Promise<void> {
  for (const pharmacy of ctx.pharmacies) {
    const existing = await prisma.document.findFirst({ where: { pharmacyId: pharmacy.id } });
    if (existing) continue;

    const staff = staffByPharmacy[pharmacy.id];
    const doc = await prisma.document.create({
      data: {
        pharmacyId: pharmacy.id,
        name: 'Lease agreement 2026',
        category: 'LEASE',
        storagePath: `uploads/demo/${pharmacy.id.slice(0, 8)}/lease-2026.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 245_000,
        uploadedByUserId: staff.partner.id,
      },
    });
    await prisma.signatureRequest.create({
      data: {
        documentId: doc.id,
        signerName: `${staff.partner.id.slice(0, 6)} Partner`,
        signerEmail: 'partner@example.ca',
        status: 'SIGNED' as SignatureStatus,
        signatureData: 'signed-demo',
        signedAt: daysFromNow(-15),
      },
    });
  }
  console.log('Seeded documents + signature requests per location');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const ctx = await resolveContext();
  const staffByPharmacy = await seedStaffUsers(ctx);
  const products = await seedCatalogExtra();
  const prescribersByPharmacy = await seedPrescribers(ctx);
  const patientsByPharmacy = await seedPatients(ctx);
  const lotsByPharmacy = await seedSuppliersAndInventory(ctx, products);
  const controlledEvents = await seedPrescriptionsAndDispensing(
    ctx, staffByPharmacy, products, patientsByPharmacy, prescribersByPharmacy, lotsByPharmacy,
  );
  await seedSales(ctx, staffByPharmacy, products, patientsByPharmacy);
  await seedNarcotics(ctx, staffByPharmacy, products, controlledEvents);
  await seedCompliance(ctx, staffByPharmacy);
  await seedRecallsAndQuarantine(ctx, products);
  await seedFinance(ctx, staffByPharmacy);
  await seedTransfers(ctx, staffByPharmacy, products);
  await seedMessagingAndNotifications(ctx, staffByPharmacy, patientsByPharmacy);
  await seedCameras(ctx);
  await seedHR(ctx, staffByPharmacy);
  await seedDocuments(ctx, staffByPharmacy);
  console.log('\nDemo data seed complete (Toronto, Vancouver, Calgary).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
