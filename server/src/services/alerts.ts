import { AlertSeverity, Prisma } from '@prisma/client';
import { prisma, type Db } from '../config/prisma';

type Tx = Prisma.TransactionClient | Db;

interface RaiseAlertInput {
  pharmacyId: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  relatedType?: string;
  relatedId?: string;
}

/**
 * Raise a compliance alert, de-duplicating against an existing OPEN alert with
 * the same (type, relatedId) so escalation runs don't spam duplicates.
 */
export async function raiseAlert(input: RaiseAlertInput, client: Tx = prisma) {
  const existing = await client.complianceAlert.findFirst({
    where: {
      pharmacyId: input.pharmacyId,
      type: input.type,
      relatedId: input.relatedId ?? null,
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    },
  });
  if (existing) return existing;

  return client.complianceAlert.create({
    data: {
      pharmacyId: input.pharmacyId,
      type: input.type,
      severity: input.severity,
      message: input.message,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
    },
  });
}
