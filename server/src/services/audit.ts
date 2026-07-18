import { AuditAction, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../config/prisma';

interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  pharmacyId?: string | null;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}

/**
 * Writes an append-only audit record. The spec requires logging every data
 * access event (view/edit/export), plus logins. Never blocks the main flow:
 * a logging failure is swallowed with an error log so it cannot take down a
 * legitimate request.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        userId: input.userId ?? input.req?.auth?.userId ?? null,
        pharmacyId: input.pharmacyId ?? input.req?.auth?.locationId ?? null,
        ipAddress: input.req?.ip ?? null,
        userAgent: input.req?.header('user-agent') ?? null,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log:', err);
  }
}
