import { RecallRisk } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AuthContext } from '../../types/express';
import { assertLocationAccess, isOwner } from '../../middleware/rbac';
import { badRequest, notFound } from '../../utils/httpError';
import { raiseAlert } from '../../services/alerts';

export interface IngestRecallInput {
  recallNumber: string;
  din?: string;
  productName: string;
  reason: string;
  risk: RecallRisk;
  publishedAt?: string;
}

/**
 * Ingest a recall (simulating the Health Canada MedEffect feed) and immediately
 * match it against inventory by DIN. For every location holding stock of the
 * recalled DIN, create a QUARANTINE record and raise a CRITICAL alert.
 *
 * A production build replaces the manual ingest with a scheduled MedEffect
 * RSS/API poll; the matching + quarantine logic here stays the same.
 */
export async function ingestRecall(input: IngestRecallInput) {
  const recall = await prisma.drugRecall.upsert({
    where: { recallNumber: input.recallNumber },
    update: {},
    create: {
      recallNumber: input.recallNumber,
      din: input.din ?? null,
      productName: input.productName,
      reason: input.reason,
      risk: input.risk,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date(),
    },
  });

  let quarantined = 0;
  if (recall.din) {
    const product = await prisma.product.findUnique({ where: { din: recall.din } });
    if (product) {
      const items = await prisma.inventoryItem.findMany({
        where: { productId: product.id },
        include: { lots: true },
      });
      for (const item of items) {
        const qty = item.lots.reduce((s, l) => s + l.quantityOnHand, 0);
        if (qty <= 0) continue;
        try {
          await prisma.quarantineRecord.create({
            data: {
              pharmacyId: item.pharmacyId,
              recallId: recall.id,
              productId: product.id,
              quantityAffected: qty,
            },
          });
        } catch {
          // Unique (pharmacy, recall, product) => already quarantined; still alert.
        }
        await raiseAlert({
          pharmacyId: item.pharmacyId,
          type: 'RECALL',
          severity: 'CRITICAL',
          message: `Recall ${recall.recallNumber}: ${recall.productName} — ${recall.reason}. ${qty} unit(s) quarantined.`,
          relatedType: 'DrugRecall',
          relatedId: recall.id,
        });
        quarantined++;
      }
    }
  }

  return { recall, locationsAffected: quarantined };
}

export async function listRecalls() {
  return prisma.drugRecall.findMany({ orderBy: { publishedAt: 'desc' }, take: 100 });
}

export async function listQuarantines(auth: AuthContext, requestedPharmacyId?: string) {
  const pharmacyId = isOwner(auth) ? requestedPharmacyId : auth.locationId;
  if (!pharmacyId && !isOwner(auth)) throw badRequest('pharmacyId is required');
  return prisma.quarantineRecord.findMany({
    where: { ...(pharmacyId ? { pharmacyId } : {}) },
    include: {
      recall: { select: { recallNumber: true, productName: true, risk: true } },
      product: { select: { name: true, din: true } },
      pharmacy: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateQuarantine(
  auth: AuthContext,
  id: string,
  status: 'CLEARED' | 'DESTROYED',
) {
  const record = await prisma.quarantineRecord.findUnique({ where: { id } });
  if (!record) throw notFound('Quarantine record not found');
  assertLocationAccess(auth, record.pharmacyId);
  return prisma.quarantineRecord.update({
    where: { id },
    data: { status, clearedAt: new Date() },
  });
}
