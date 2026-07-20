import { SaleItemType, PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, notFound } from '../../utils/httpError';
import { taxCentsFor } from '../../services/tax';
import { decrementStockFEFO } from '../inventory/inventory.service';

export interface SaleLineInput {
  itemType: SaleItemType;
  description: string;
  productId?: string;
  quantity: number;
  unitPriceCents: number;
  taxable?: boolean;
}

export interface CreateSaleInput {
  pharmacyId?: string;
  patientId?: string;
  paymentMethod: PaymentMethod;
  lines: SaleLineInput[];
}

export async function createSale(auth: AuthContext, input: CreateSaleInput) {
  const pharmacyId = isOwner(auth) ? input.pharmacyId : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  if (input.lines.length === 0) throw badRequest('Sale must have at least one line');

  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) throw notFound('Pharmacy not found');

  // Prescription drugs are zero-rated; default RX lines to non-taxable.
  const lines = input.lines.map((l) => {
    const taxable = l.taxable ?? l.itemType !== 'RX';
    const lineTotalCents = l.unitPriceCents * l.quantity;
    return { ...l, taxable, lineTotalCents };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const taxableCents = lines.filter((l) => l.taxable).reduce((s, l) => s + l.lineTotalCents, 0);
  const taxCents = taxCentsFor(pharmacy.province, taxableCents);
  const totalCents = subtotalCents + taxCents;

  return prisma.$transaction(async (tx) => {
    // Decrement stock for OTC/product-backed lines (Rx stock already left on dispense).
    for (const l of lines) {
      if (l.productId && l.itemType === 'OTC') {
        await decrementStockFEFO(tx, pharmacyId, l.productId, l.quantity);
      }
    }

    const sale = await tx.sale.create({
      data: {
        pharmacyId,
        cashierUserId: auth.userId,
        patientId: input.patientId ?? null,
        province: pharmacy.province,
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod: input.paymentMethod,
        lines: {
          create: lines.map((l) => ({
            itemType: l.itemType,
            description: l.description,
            productId: l.productId ?? null,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            lineTotalCents: l.lineTotalCents,
            taxable: l.taxable,
          })),
        },
      },
      include: { lines: true },
    });

    return sale;
  });
}

/** Single-sale detail (needed so a cashier can look up an older receipt to process a refund against). */
export async function getSale(auth: AuthContext, id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: { lines: true } });
  if (!sale) throw notFound('Sale not found');
  assertLocationAccess(auth, sale.pharmacyId);
  return sale;
}

/** Pure computation, no AuthContext — used both by the authed route and the scheduled daily-summary job. */
export async function computeDailySummary(pharmacyId: string, day = new Date()) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sales = await prisma.sale.findMany({
    where: { pharmacyId, createdAt: { gte: start, lt: end } },
  });

  const byMethod: Record<string, number> = {};
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  for (const s of sales) {
    byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.totalCents;
    subtotal += s.subtotalCents;
    tax += s.taxCents;
    total += s.totalCents;
  }

  return {
    date: start.toISOString().slice(0, 10),
    transactionCount: sales.length,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: total,
    byPaymentMethod: byMethod,
  };
}

/** Daily cash-reconciliation summary for a location, scoped to the caller. */
export async function dailySummary(auth: AuthContext, requestedPharmacyId?: string, day = new Date()) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return computeDailySummary(pharmacyId, day);
}
