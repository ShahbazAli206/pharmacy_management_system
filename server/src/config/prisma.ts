import { PrismaClient, Prisma } from '@prisma/client';
import { isProd } from './env';
import { getRlsContext, rlsStorage } from './rlsContext';

/**
 * Base client. All queries go through the `$extends` wrapper below, which sets
 * the RLS GUCs (app.is_owner / app.pharmacy_id) on each query's transaction so
 * PostgreSQL row-level security scopes patient-family tables to the caller.
 *
 * The app connects as the least-privilege `pharmacy_app` role (see .env), which
 * cannot bypass RLS — so these GUCs are what make patient data visible at all.
 */
const base = new PrismaClient({
  log: isProd ? ['warn', 'error'] : ['warn', 'error'],
});

// Transaction-local SET of the two GUCs from the current request context.
function setGucs(client: Pick<PrismaClient, '$queryRaw'>) {
  const ctx = getRlsContext();
  return [
    client.$queryRaw`SELECT set_config('app.is_owner', ${ctx.isOwner ? 'on' : 'off'}, true)`,
    client.$queryRaw`SELECT set_config('app.pharmacy_id', ${ctx.pharmacyId ?? ''}, true)`,
  ] as const;
}

type TxOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

/** GUC-injecting replacement for $transaction, typed like Prisma's own overloads. */
const rlsTransaction = function rlsTransaction(this: unknown, ...txArgs: unknown[]): Promise<unknown> {
  const ctx = getRlsContext();
  const scoped = { ...ctx, inTx: true };

  // Interactive form: $transaction(async (tx) => ..., options?)
  if (typeof txArgs[0] === 'function') {
    const fn = txArgs[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
    const options = txArgs[1] as TxOptions | undefined;
    return rlsStorage.run(scoped, () =>
      base.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.is_owner', ${ctx.isOwner ? 'on' : 'off'}, true)`;
        await tx.$queryRaw`SELECT set_config('app.pharmacy_id', ${ctx.pharmacyId ?? ''}, true)`;
        return fn(tx);
      }, options),
    );
  }

  // Batch form: $transaction([...ops], options?)
  const ops = txArgs[0] as Prisma.PrismaPromise<unknown>[];
  const options = txArgs[1] as TxOptions | undefined;
  return rlsStorage.run(scoped, () =>
    base
      .$transaction([...setGucs(base), ...ops] as never, options as never)
      .then((results: unknown) => (results as unknown[]).slice(2)),
  );
} as {
  <P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<{ -readonly [K in keyof P]: Awaited<P[K]> }>;
  <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, options?: TxOptions): Promise<R>;
};

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        // Inside an explicit $transaction the GUCs are already set for that
        // transaction (see the $transaction override) — run the op directly to
        // avoid nesting a second transaction.
        if (rlsStorage.getStore()?.inTx) {
          return query(args);
        }
        // Otherwise wrap this single op so its GUCs + query share one
        // transaction/connection (this also covers nested relation includes).
        const [, , result] = await base.$transaction([...setGucs(base), query(args)] as never);
        return result as unknown;
      },
    },
  },
  client: {
    // Shadow $transaction so batch/interactive transactions set the GUCs once at
    // the start and their inner ops don't each re-open a transaction. Typed with
    // Prisma's own overloads so callers keep full type inference.
    $transaction: rlsTransaction,
  },
});

/** The extended client's type — for helpers that accept "the client or a tx". */
export type Db = typeof prisma;

export async function disconnectPrisma(): Promise<void> {
  await base.$disconnect();
}
