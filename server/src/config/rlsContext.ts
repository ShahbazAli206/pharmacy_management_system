import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request location context propagated to PostgreSQL row-level security.
 * The Prisma extension (see prisma.ts) reads this and sets the `app.is_owner`
 * and `app.pharmacy_id` GUCs on each query's transaction, so RLS policies scope
 * patient-family tables to the caller's pharmacy.
 */
export interface RlsContext {
  isOwner: boolean;
  pharmacyId: string | null;
  /** True while inside an explicit $transaction (GUCs already set — don't re-wrap). */
  inTx: boolean;
}

export const rlsStorage = new AsyncLocalStorage<RlsContext>();

// Fail-closed default: with no request context, RLS-protected tables are
// invisible (is_owner off + empty pharmacy matches nothing). Every real request
// sets a concrete context in the auth middleware. The superuser used for
// migrations/seed bypasses RLS entirely, so this never blocks those.
const DEFAULT: RlsContext = { isOwner: false, pharmacyId: null, inTx: false };

export function getRlsContext(): RlsContext {
  return rlsStorage.getStore() ?? DEFAULT;
}

/** Run a request handler chain within a caller's location context. */
export function runWithRlsContext(
  ctx: { isOwner: boolean; pharmacyId: string | null },
  fn: () => void,
): void {
  rlsStorage.run({ isOwner: ctx.isOwner, pharmacyId: ctx.pharmacyId, inTx: false }, fn);
}
