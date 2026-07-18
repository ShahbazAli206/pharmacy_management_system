import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { postNarcoticTxn } from '../narcotics/narcotics.service';

type Tx = Prisma.TransactionClient | Db;

/** Resolve the pharmacy an inventory action targets, enforcing isolation. */
function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

export async function listInventory(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const items = await prisma.inventoryItem.findMany({
    where: { pharmacyId },
    include: {
      product: true,
      supplier: { select: { id: true, name: true } },
      lots: { orderBy: { expiryDate: 'asc' } },
    },
    orderBy: { product: { name: 'asc' } },
  });

  return items.map((it) => {
    const quantityOnHand = it.lots.reduce((s, l) => s + l.quantityOnHand, 0);
    return {
      id: it.id,
      product: it.product,
      supplier: it.supplier,
      reorderThreshold: it.reorderThreshold,
      reorderQuantity: it.reorderQuantity,
      quantityOnHand,
      belowThreshold: quantityOnHand <= it.reorderThreshold,
      lots: it.lots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        expiryDate: l.expiryDate,
        quantityOnHand: l.quantityOnHand,
        unitCostCents: l.unitCostCents,
      })),
    };
  });
}

export interface ReceiveStockInput {
  pharmacyId?: string;
  productId: string;
  quantity: number;
  lotNumber?: string;
  expiryDate?: string;
  unitCostCents?: number;
  supplierId?: string;
  reorderThreshold?: number;
  reorderQuantity?: number;
}

/** Receive stock into a location: upsert the inventory item, add a lot. */
export async function receiveStock(auth: AuthContext, input: ReceiveStockInput) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);
  if (input.quantity <= 0) throw badRequest('quantity must be positive');

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('Product not found');

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { pharmacyId_productId: { pharmacyId, productId: input.productId } },
      create: {
        pharmacyId,
        productId: input.productId,
        supplierId: input.supplierId ?? null,
        reorderThreshold: input.reorderThreshold ?? 0,
        reorderQuantity: input.reorderQuantity ?? 0,
      },
      update: {
        supplierId: input.supplierId ?? undefined,
        reorderThreshold: input.reorderThreshold ?? undefined,
        reorderQuantity: input.reorderQuantity ?? undefined,
      },
    });

    const lot = await tx.stockLot.create({
      data: {
        inventoryItemId: item.id,
        lotNumber: input.lotNumber ?? null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        quantityOnHand: input.quantity,
        unitCostCents: input.unitCostCents ?? 0,
      },
    });

    // Controlled substances: mirror the receipt into the narcotics register so
    // its running balance stays in step with physical stock (CDSA). Without this
    // a later dispense would be blocked by the register's non-negative rule.
    if (product.isControlled) {
      await postNarcoticTxn(tx, {
        pharmacyId,
        productId: input.productId,
        type: 'RECEIPT',
        quantityChange: input.quantity,
        performedByUserId: auth.userId,
        referenceType: 'StockLot',
        referenceId: lot.id,
      });
    }

    return { inventoryItemId: item.id, lot };
  });
}

/**
 * Decrement stock using FEFO (first-expiry-first-out). Returns the primary lot
 * drawn from (for the dispensing record). Throws if stock is insufficient.
 * Runs inside a caller-provided transaction so it composes with dispensing/POS.
 */
export async function decrementStockFEFO(
  tx: Tx,
  pharmacyId: string,
  productId: string,
  quantity: number,
): Promise<{ primaryLotId: string | null; lotNumber: string | null; expiryDate: Date | null }> {
  const item = await tx.inventoryItem.findUnique({
    where: { pharmacyId_productId: { pharmacyId, productId } },
    include: { lots: { orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!item) throw badRequest('No inventory for this product at this location');

  const total = item.lots.reduce((s, l) => s + l.quantityOnHand, 0);
  if (total < quantity) throw badRequest(`Insufficient stock: have ${total}, need ${quantity}`);

  let remaining = quantity;
  let primary: { id: string; lotNumber: string | null; expiryDate: Date | null } | null = null;

  for (const lot of item.lots) {
    if (remaining <= 0) break;
    if (lot.quantityOnHand <= 0) continue;
    const take = Math.min(lot.quantityOnHand, remaining);
    await tx.stockLot.update({
      where: { id: lot.id },
      data: { quantityOnHand: { decrement: take } },
    });
    if (!primary) primary = { id: lot.id, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate };
    remaining -= take;
  }

  return {
    primaryLotId: primary?.id ?? null,
    lotNumber: primary?.lotNumber ?? null,
    expiryDate: primary?.expiryDate ?? null,
  };
}

/** Lots expiring within the given horizon, bucketed at 30/60/90 days. */
export async function expiryAlerts(auth: AuthContext, requestedPharmacyId?: string, now = new Date()) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const lots = await prisma.stockLot.findMany({
    where: {
      quantityOnHand: { gt: 0 },
      expiryDate: { not: null, lte: horizon },
      inventoryItem: { pharmacyId },
    },
    include: { inventoryItem: { include: { product: true } } },
    orderBy: { expiryDate: 'asc' },
  });

  return lots.map((l) => {
    const days = Math.ceil((l.expiryDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const bucket = days <= 0 ? 'EXPIRED' : days <= 30 ? '30' : days <= 60 ? '60' : '90';
    return {
      lotId: l.id,
      product: l.inventoryItem.product.name,
      din: l.inventoryItem.product.din,
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate,
      daysToExpiry: days,
      bucket,
      quantityOnHand: l.quantityOnHand,
    };
  });
}

/** Items at/below reorder threshold. */
export async function lowStock(auth: AuthContext, requestedPharmacyId?: string) {
  const inv = await listInventory(auth, requestedPharmacyId);
  return inv.filter((i) => i.belowThreshold && i.reorderThreshold > 0);
}

/**
 * Auto-generate draft purchase orders for all low-stock items, grouped by
 * supplier. Returns the created POs.
 */
export async function generateReorderPOs(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const low = await lowStock(auth, requestedPharmacyId);
  if (low.length === 0) return [];

  // Group by supplier (null supplier => one "unassigned" PO).
  const bySupplier = new Map<string | null, typeof low>();
  for (const item of low) {
    const key = item.supplier?.id ?? null;
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key)!.push(item);
  }

  const created = [];
  for (const [supplierId, items] of bySupplier) {
    const po = await prisma.purchaseOrder.create({
      data: {
        pharmacyId,
        supplierId,
        status: 'DRAFT',
        autoGenerated: true,
        createdByUserId: auth.userId,
        lines: {
          create: items.map((it) => ({
            productId: it.product.id,
            quantityOrdered: it.reorderQuantity > 0 ? it.reorderQuantity : it.reorderThreshold,
            unitCostCents: it.product.defaultPriceCents,
          })),
        },
      },
      include: { lines: true },
    });
    created.push(po);
  }
  return created;
}

/** Guard used by supplier routes to keep supplier records location-scoped. */
export function assertCanManageSupplierLocation(auth: AuthContext, pharmacyId: string) {
  if (!isOwner(auth) && auth.locationId !== pharmacyId) {
    throw forbidden('Cross-location access denied');
  }
}
