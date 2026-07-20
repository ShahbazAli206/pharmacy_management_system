import crypto from 'crypto';
import { PaymentMethod, Prisma, RefundStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../utils/httpError';
import { restockReturn } from '../inventory/inventory.service';
import { getSettings } from '../../services/settings';
import { getPaymentGateway } from '../../services/paymentGateway';
import { getInsuranceAdjudicationProvider } from '../../services/insuranceAdjudication';

const CARD_METHODS: PaymentMethod[] = ['DEBIT', 'CREDIT'];

/**
 * Refunds a card charge through the gateway (before any DB write — a decline
 * must stop the refund, not partially apply it). No-op for cash/insurance
 * sales, or a card sale that somehow never got a gateway transaction id.
 */
async function refundCardChargeIfNeeded(
  paymentMethod: PaymentMethod,
  originalTransactionId: string | null,
  amountCents: number,
): Promise<string | null> {
  if (!CARD_METHODS.includes(paymentMethod) || !originalTransactionId) return null;
  const result = await getPaymentGateway().refund({
    originalTransactionId,
    amountCents,
    idempotencyKey: crypto.randomUUID(),
  });
  if (!result.ok) throw badRequest(`Gateway refund failed: ${result.error ?? 'unknown error'}`);
  return result.transactionId ?? null;
}

/**
 * Reverses the whole insurance claim (not a partial amount — real payers
 * reverse/adjust at the claim level, not a dollar sub-amount) whenever any
 * refund against an insurance-adjudicated sale completes. No-op for
 * cash/card sales, or an insurance sale that somehow has no claim id.
 */
async function reverseInsuranceClaimIfNeeded(paymentMethod: PaymentMethod, claimId: string | null): Promise<void> {
  if (paymentMethod !== 'INSURANCE' || !claimId) return;
  const result = await getInsuranceAdjudicationProvider().reverseClaim(claimId);
  if (!result.ok) throw badRequest(`Insurance claim reversal failed: ${result.error ?? 'unknown error'}`);
}

export interface RefundLineInput {
  saleLineId: string;
  quantity: number;
}

export interface CreateRefundInput {
  saleId: string;
  reason: string;
  lines: RefundLineInput[];
}

const REFUND_LINE_INCLUDE = {
  saleLine: { include: { sale: true } },
} satisfies Prisma.RefundLineInclude;

const REFUND_INCLUDE = {
  lines: { include: REFUND_LINE_INCLUDE },
} satisfies Prisma.RefundInclude;

/** Quantity already reserved/refunded per saleLineId, counting PENDING_APPROVAL + COMPLETED refunds (not REJECTED). */
async function refundedQuantities(saleLineIds: string[]): Promise<Map<string, number>> {
  const lines = await prisma.refundLine.findMany({
    where: { saleLineId: { in: saleLineIds }, refund: { status: { in: ['PENDING_APPROVAL', 'COMPLETED'] } } },
  });
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.saleLineId, (map.get(l.saleLineId) ?? 0) + l.quantity);
  return map;
}

/** Restocks OTC lines only — controlled substances and Rx dispenses are never auto-returned to stock. */
async function restockRefundLines(
  tx: Prisma.TransactionClient,
  pharmacyId: string,
  lines: Array<{ quantity: number; saleLine: { productId: string | null; itemType: string } }>,
) {
  for (const line of lines) {
    if (line.saleLine.itemType !== 'OTC' || !line.saleLine.productId) continue;
    const product = await tx.product.findUnique({ where: { id: line.saleLine.productId } });
    if (!product || product.isControlled) continue;
    await restockReturn(tx, pharmacyId, line.saleLine.productId, line.quantity);
  }
}

export async function createRefund(auth: AuthContext, input: CreateRefundInput) {
  if (input.lines.length === 0) throw badRequest('Refund must have at least one line');

  const sale = await prisma.sale.findUnique({ where: { id: input.saleId }, include: { lines: true } });
  if (!sale) throw notFound('Sale not found');
  assertLocationAccess(auth, sale.pharmacyId);

  const saleLineById = new Map(sale.lines.map((l) => [l.id, l]));
  for (const l of input.lines) {
    const saleLine = saleLineById.get(l.saleLineId);
    if (!saleLine) throw badRequest(`Sale line ${l.saleLineId} does not belong to this sale`);
    if (l.quantity <= 0) throw badRequest('Refund quantity must be positive');
  }

  const already = await refundedQuantities(input.lines.map((l) => l.saleLineId));
  let amountCents = 0;
  const lineData = input.lines.map((l) => {
    const saleLine = saleLineById.get(l.saleLineId)!;
    const remaining = saleLine.quantity - (already.get(l.saleLineId) ?? 0);
    if (l.quantity > remaining) {
      throw badRequest(`Only ${remaining} unit(s) of "${saleLine.description}" remain refundable`);
    }
    const lineAmountCents = saleLine.unitPriceCents * l.quantity;
    amountCents += lineAmountCents;
    return { saleLineId: l.saleLineId, quantity: l.quantity, amountCents: lineAmountCents };
  });

  const threshold = (await getSettings()).refundApprovalThresholdCents;
  const needsApproval = amountCents > threshold;

  // Gateway call happens BEFORE the transaction opens — same reasoning as
  // sales.service.ts's charge: an external network call shouldn't hold a DB
  // transaction open, and a decline must stop the refund from being created.
  const paymentTransactionId = needsApproval
    ? null
    : await refundCardChargeIfNeeded(sale.paymentMethod, sale.paymentTransactionId, amountCents);
  if (!needsApproval) await reverseInsuranceClaimIfNeeded(sale.paymentMethod, sale.insuranceClaimId);

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        pharmacyId: sale.pharmacyId,
        saleId: sale.id,
        amountCents,
        reason: input.reason,
        status: needsApproval ? 'PENDING_APPROVAL' : 'COMPLETED',
        requestedByUserId: auth.userId,
        paymentTransactionId,
        ...(needsApproval ? {} : { decidedAt: new Date() }),
        lines: { create: lineData },
      },
      include: REFUND_INCLUDE,
    });

    if (!needsApproval) {
      await restockRefundLines(tx, sale.pharmacyId, refund.lines);
    }
    return refund;
  });
}

export async function listRefunds(auth: AuthContext, requestedPharmacyId?: string, status?: RefundStatus) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId ?? undefined;
  return prisma.refund.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}), ...(status ? { status } : {}) },
    include: { ...REFUND_INCLUDE, sale: { select: { id: true, createdAt: true, paymentMethod: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function decideRefund(
  auth: AuthContext,
  id: string,
  decision: 'APPROVED' | 'REJECTED',
): Promise<ReturnType<typeof prisma.refund.update>> {
  const refund = await prisma.refund.findUnique({ where: { id }, include: REFUND_INCLUDE });
  if (!refund) throw notFound('Refund not found');
  assertLocationAccess(auth, refund.pharmacyId);
  if (refund.status !== 'PENDING_APPROVAL') throw badRequest(`Refund is already ${refund.status}`);
  if (refund.requestedByUserId === auth.userId) throw forbidden('You cannot approve your own refund');

  const sale = refund.lines[0]?.saleLine.sale;
  const paymentTransactionId =
    decision === 'APPROVED' && sale ? await refundCardChargeIfNeeded(sale.paymentMethod, sale.paymentTransactionId, refund.amountCents) : null;
  if (decision === 'APPROVED' && sale) await reverseInsuranceClaimIfNeeded(sale.paymentMethod, sale.insuranceClaimId);

  return prisma.$transaction(async (tx) => {
    if (decision === 'APPROVED') {
      await restockRefundLines(tx, refund.pharmacyId, refund.lines);
    }
    return tx.refund.update({
      where: { id },
      data: {
        status: decision === 'APPROVED' ? 'COMPLETED' : 'REJECTED',
        decidedByUserId: auth.userId,
        decidedAt: new Date(),
        ...(paymentTransactionId ? { paymentTransactionId } : {}),
      },
      include: REFUND_INCLUDE,
    });
  });
}
