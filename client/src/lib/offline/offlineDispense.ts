import { api, ApiError } from '../api';
import { idbGetAll, idbPut, idbPutAll, idbDelete, STORES } from './db';
import type { PrescriptionRow } from '../types';

export interface PendingDispense {
  idempotencyKey: string;
  prescriptionId: string;
  quantity?: number;
  counsellingNotes?: string;
  queuedAt: string;
  lastError?: string;
}

/** Snapshots the current prescription list — read back when the live API call fails (offline). */
export async function cachePrescriptions(rows: PrescriptionRow[]): Promise<void> {
  await idbPutAll(STORES.cachedPrescriptions, rows);
}

export async function getCachedPrescriptions(): Promise<PrescriptionRow[]> {
  return idbGetAll<PrescriptionRow>(STORES.cachedPrescriptions);
}

export async function getPendingDispenses(): Promise<PendingDispense[]> {
  const rows = await idbGetAll<PendingDispense>(STORES.pendingDispenses);
  return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

/**
 * Queues a dispense for later sync (spec §13.2) and optimistically updates
 * the local cached copy so the pharmacist sees the fill reflected
 * immediately, without waiting for reconnection.
 */
export async function queueDispense(
  prescriptionId: string,
  input: { quantity?: number; counsellingNotes?: string },
): Promise<PendingDispense> {
  const pending: PendingDispense = {
    idempotencyKey: crypto.randomUUID(),
    prescriptionId,
    ...input,
    queuedAt: new Date().toISOString(),
  };
  await idbPut(STORES.pendingDispenses, pending);

  const cached = await getCachedPrescriptions();
  const rx = cached.find((r) => r.id === prescriptionId);
  if (rx) {
    const refillsUsed = rx.refillsUsed + 1;
    const fillsAllowed = 1 + rx.refillsAuthorized;
    await idbPut(STORES.cachedPrescriptions, {
      ...rx,
      refillsUsed,
      status: refillsUsed >= fillsAllowed ? 'COMPLETED' : rx.status,
    });
  }
  return pending;
}

/** Removes a queued dispense without syncing it — for a job an owner/manager has decided to abandon (e.g. a persistent conflict). */
export async function discardPendingDispense(idempotencyKey: string): Promise<void> {
  await idbDelete(STORES.pendingDispenses, idempotencyKey);
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ prescriptionId: string; message: string }>;
}

let syncInFlight: Promise<SyncResult> | null = null;

/**
 * Replays every queued dispense against the real API. Safe to call
 * repeatedly (e.g. on every 'online' event, or a periodic timer) — a sync
 * already in flight is awaited rather than duplicated. Each job carries the
 * same idempotencyKey it was queued with, so even if a previous sync attempt
 * actually succeeded server-side but the response was lost (e.g. connection
 * dropped again mid-request), retrying is safe — the server returns the
 * original result instead of double-dispensing.
 */
export async function syncPendingDispenses(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync();
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function runSync(): Promise<SyncResult> {
  const pending = await getPendingDispenses();
  let synced = 0;
  const errors: SyncResult['errors'] = [];

  for (const job of pending) {
    try {
      await api(`/prescriptions/${job.prescriptionId}/dispense`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: job.quantity,
          counsellingNotes: job.counsellingNotes,
          idempotencyKey: job.idempotencyKey,
        }),
      });
      await idbDelete(STORES.pendingDispenses, job.idempotencyKey);
      synced++;
    } catch (e) {
      // A genuine conflict (e.g. insufficient stock by the time we synced) —
      // keep the job queued with the error attached rather than silently
      // dropping it, so the UI can surface it for a human to resolve.
      const message = e instanceof ApiError ? e.message : 'Sync failed';
      errors.push({ prescriptionId: job.prescriptionId, message });
      await idbPut(STORES.pendingDispenses, { ...job, lastError: message });
    }
  }
  return { synced, failed: errors.length, errors };
}
