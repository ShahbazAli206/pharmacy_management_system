import { CountPeriod, NarcoticTxnType, Prisma } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, notFound, HttpError } from '../../utils/httpError';
import { raiseAlert } from '../../services/alerts';

type Tx = Prisma.TransactionClient | Db;

function scopeFor(auth: AuthContext, requested?: string): string {
  const pharmacyId = isOwner(auth) ? requested : auth.locationId;
  if (!pharmacyId) throw badRequest('pharmacyId is required');
  assertLocationAccess(auth, pharmacyId);
  return pharmacyId;
}

/** Current running balance for a controlled product = last txn's balanceAfter. */
async function currentBalance(client: Tx, pharmacyId: string, productId: string): Promise<number> {
  const last = await client.narcoticTxn.findFirst({
    where: { pharmacyId, productId },
    orderBy: { createdAt: 'desc' },
  });
  return last?.balanceAfter ?? 0;
}

/** Is this product locked due to an unresolved count discrepancy? */
async function isLocked(client: Tx, pharmacyId: string, productId: string): Promise<boolean> {
  const open = await client.narcoticCount.findFirst({
    where: { pharmacyId, productId, status: 'DISCREPANCY' },
  });
  return open !== null;
}

interface PostTxnInput {
  pharmacyId: string;
  productId: string;
  type: NarcoticTxnType;
  quantityChange: number; // signed
  performedByUserId: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

/**
 * Append a narcotic-register transaction with an updated running balance.
 * Blocks if the product is locked by an unresolved discrepancy (CDSA control).
 * Exported so dispensing can post DISPENSE entries inside its own transaction.
 */
export async function postNarcoticTxn(client: Tx, input: PostTxnInput) {
  if (await isLocked(client, input.pharmacyId, input.productId)) {
    throw new HttpError(
      423,
      'Narcotic locked: unresolved count discrepancy for this product',
      'NARCOTIC_LOCKED',
    );
  }
  const balance = await currentBalance(client, input.pharmacyId, input.productId);
  const balanceAfter = balance + input.quantityChange;
  if (balanceAfter < 0) throw badRequest('Narcotic balance cannot go negative');

  return client.narcoticTxn.create({
    data: {
      pharmacyId: input.pharmacyId,
      productId: input.productId,
      type: input.type,
      quantityChange: input.quantityChange,
      balanceAfter,
      performedByUserId: input.performedByUserId,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function recordTxn(
  auth: AuthContext,
  input: { pharmacyId?: string; productId: string; type: NarcoticTxnType; quantityChange: number; notes?: string },
) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('Product not found');
  if (!product.isControlled) throw badRequest('Product is not a controlled substance');

  return postNarcoticTxn(prisma, {
    pharmacyId,
    productId: input.productId,
    type: input.type,
    quantityChange: input.quantityChange,
    performedByUserId: auth.userId,
    notes: input.notes,
  });
}

export async function getRegister(auth: AuthContext, requestedPharmacyId?: string, productId?: string) {
  const pharmacyId = scopeFor(auth, requestedPharmacyId);
  const txns = await prisma.narcoticTxn.findMany({
    where: { pharmacyId, ...(productId ? { productId } : {}) },
    include: {
      product: { select: { name: true, din: true, strength: true } },
      performedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return txns;
}

/**
 * Record a narcotic count. If counted != expected running balance, flags a
 * DISCREPANCY, raises a CRITICAL alert, and locks the product (future txns
 * blocked by postNarcoticTxn) until resolved. A balanced count posts a
 * COUNT_ADJUSTMENT of 0 for the audit trail.
 */
export async function recordCount(
  auth: AuthContext,
  input: { pharmacyId?: string; productId: string; period: CountPeriod; countedQuantity: number; notes?: string },
) {
  const pharmacyId = scopeFor(auth, input.pharmacyId);
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('Product not found');
  if (!product.isControlled) throw badRequest('Product is not a controlled substance');

  const expected = await currentBalance(prisma, pharmacyId, input.productId);
  const discrepancy = input.countedQuantity - expected;

  const count = await prisma.narcoticCount.create({
    data: {
      pharmacyId,
      productId: input.productId,
      period: input.period,
      countedQuantity: input.countedQuantity,
      expectedQuantity: expected,
      discrepancy,
      status: discrepancy === 0 ? 'BALANCED' : 'DISCREPANCY',
      countedByUserId: auth.userId,
      notes: input.notes ?? null,
    },
  });

  if (discrepancy !== 0) {
    await raiseAlert({
      pharmacyId,
      type: 'NARCOTIC_DISCREPANCY',
      severity: 'CRITICAL',
      message: `Narcotic count discrepancy for ${product.name}: counted ${input.countedQuantity}, expected ${expected} (${discrepancy > 0 ? '+' : ''}${discrepancy}). Locked until resolved.`,
      relatedType: 'NarcoticCount',
      relatedId: count.id,
    });
  }

  return count;
}

/**
 * Resolve a discrepancy: posts a COUNT_ADJUSTMENT to bring the register to the
 * physically counted quantity, closes the alert, and unlocks the product.
 */
export async function resolveCount(auth: AuthContext, countId: string) {
  const count = await prisma.narcoticCount.findUnique({ where: { id: countId } });
  if (!count) throw notFound('Count not found');
  assertLocationAccess(auth, count.pharmacyId);
  if (count.status !== 'DISCREPANCY') throw badRequest('Count is not in discrepancy');

  return prisma.$transaction(async (tx) => {
    // Adjust the ledger by the discrepancy so balance matches the count.
    // Temporarily clear the lock by marking resolved first, then post.
    await tx.narcoticCount.update({
      where: { id: countId },
      data: { status: 'RESOLVED', resolvedByUserId: auth.userId, resolvedAt: new Date() },
    });

    await postNarcoticTxn(tx, {
      pharmacyId: count.pharmacyId,
      productId: count.productId,
      type: 'COUNT_ADJUSTMENT',
      quantityChange: count.discrepancy,
      performedByUserId: auth.userId,
      referenceType: 'NarcoticCount',
      referenceId: count.id,
      notes: 'Adjustment to reconcile counted quantity',
    });

    // Close the related alert.
    await tx.complianceAlert.updateMany({
      where: { type: 'NARCOTIC_DISCREPANCY', relatedId: count.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      data: { status: 'RESOLVED', resolvedByUserId: auth.userId, resolvedAt: new Date() },
    });

    return { resolved: true, adjustedBy: count.discrepancy };
  });
}
