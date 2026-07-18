import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { decrementStockFEFO } from '../inventory/inventory.service';
import { postNarcoticTxn } from '../narcotics/narcotics.service';

const includeShape = {
  product: { select: { id: true, name: true, din: true, strength: true, isControlled: true } },
  fromPharmacy: { select: { id: true, name: true, code: true } },
  toPharmacy: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { firstName: true, lastName: true } },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StockTransferInclude;

/** Transfers touching the caller's location (owner sees all, optionally filtered). */
export async function listTransfers(auth: AuthContext, requestedPharmacyId?: string) {
  let where: Prisma.StockTransferWhereInput;
  if (isOwner(auth)) {
    where = requestedPharmacyId
      ? { OR: [{ fromPharmacyId: requestedPharmacyId }, { toPharmacyId: requestedPharmacyId }] }
      : {};
  } else {
    const loc = auth.locationId ?? '__none__';
    where = { OR: [{ fromPharmacyId: loc }, { toPharmacyId: loc }] };
  }
  return prisma.stockTransfer.findMany({
    where,
    include: includeShape,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export interface RequestTransferInput {
  fromPharmacyId?: string; // owner may name the source; others use their own location
  toPharmacyId: string;
  productId: string;
  quantity: number;
  reason?: string;
}

/** Raise a transfer request (stock does not move until it is approved). */
export async function requestTransfer(auth: AuthContext, input: RequestTransferInput) {
  const fromPharmacyId = isOwner(auth) ? input.fromPharmacyId : auth.locationId;
  if (!fromPharmacyId) throw badRequest('fromPharmacyId is required');
  // Non-owners can only send from their own location.
  assertLocationAccess(auth, fromPharmacyId);
  if (input.quantity <= 0) throw badRequest('quantity must be positive');
  if (fromPharmacyId === input.toPharmacyId) throw badRequest('Source and destination must differ');

  const [source, dest, product] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: fromPharmacyId } }),
    prisma.pharmacy.findUnique({ where: { id: input.toPharmacyId } }),
    prisma.product.findUnique({ where: { id: input.productId } }),
  ]);
  if (!source) throw notFound('Source pharmacy not found');
  if (!dest) throw notFound('Destination pharmacy not found');
  if (!product) throw notFound('Product not found');

  return prisma.stockTransfer.create({
    data: {
      fromPharmacyId,
      toPharmacyId: input.toPharmacyId,
      productId: input.productId,
      quantity: input.quantity,
      reason: input.reason ?? null,
      requestedByUserId: auth.userId,
      status: 'REQUESTED',
    },
    include: includeShape,
  });
}

/**
 * Approve a request (owner-only at the route layer): moves stock FEFO out of the
 * source and receives it into the destination in one transaction. Controlled
 * substances also post to each location's narcotics register so running
 * balances stay in step.
 */
export async function approveTransfer(auth: AuthContext, id: string) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!transfer) throw notFound('Transfer not found');
  if (transfer.status !== 'REQUESTED') throw badRequest(`Transfer is already ${transfer.status}`);

  return prisma.$transaction(async (tx) => {
    // Pull from the source (throws if insufficient stock).
    await decrementStockFEFO(tx, transfer.fromPharmacyId, transfer.productId, transfer.quantity);

    // Receive into the destination: upsert the inventory item, add a lot.
    const item = await tx.inventoryItem.upsert({
      where: {
        pharmacyId_productId: {
          pharmacyId: transfer.toPharmacyId,
          productId: transfer.productId,
        },
      },
      create: { pharmacyId: transfer.toPharmacyId, productId: transfer.productId },
      update: {},
    });
    await tx.stockLot.create({
      data: {
        inventoryItemId: item.id,
        lotNumber: `XFER-${transfer.id.slice(0, 8)}`,
        expiryDate: null,
        quantityOnHand: transfer.quantity,
        unitCostCents: 0,
      },
    });

    // Keep both narcotics registers balanced for controlled substances (CDSA).
    if (transfer.product.isControlled) {
      await postNarcoticTxn(tx, {
        pharmacyId: transfer.fromPharmacyId,
        productId: transfer.productId,
        type: 'TRANSFER',
        quantityChange: -transfer.quantity,
        performedByUserId: auth.userId,
        referenceType: 'StockTransfer',
        referenceId: transfer.id,
      });
      await postNarcoticTxn(tx, {
        pharmacyId: transfer.toPharmacyId,
        productId: transfer.productId,
        type: 'RECEIPT',
        quantityChange: transfer.quantity,
        performedByUserId: auth.userId,
        referenceType: 'StockTransfer',
        referenceId: transfer.id,
      });
    }

    return tx.stockTransfer.update({
      where: { id },
      data: { status: 'APPROVED', approvedByUserId: auth.userId, decidedAt: new Date() },
      include: includeShape,
    });
  });
}

/** Reject a request (owner-only at the route layer). No stock moves. */
export async function rejectTransfer(auth: AuthContext, id: string) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id } });
  if (!transfer) throw notFound('Transfer not found');
  if (transfer.status !== 'REQUESTED') throw badRequest(`Transfer is already ${transfer.status}`);
  return prisma.stockTransfer.update({
    where: { id },
    data: { status: 'REJECTED', approvedByUserId: auth.userId, decidedAt: new Date() },
    include: includeShape,
  });
}

/** The requester (or owner) cancels their own still-pending request. */
export async function cancelTransfer(auth: AuthContext, id: string) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id } });
  if (!transfer) throw notFound('Transfer not found');
  if (transfer.status !== 'REQUESTED') throw badRequest(`Transfer is already ${transfer.status}`);
  if (!isOwner(auth) && transfer.requestedByUserId !== auth.userId) {
    throw forbidden('Only the requester can cancel this transfer');
  }
  return prisma.stockTransfer.update({
    where: { id },
    data: { status: 'CANCELLED', decidedAt: new Date() },
    include: includeShape,
  });
}
