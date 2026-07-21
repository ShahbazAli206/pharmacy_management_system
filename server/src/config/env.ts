import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Superuser connection (Prisma reads this directly for migrations/seed); the
  // backup service also needs it to dump past RLS. Optional here since not
  // every deployment runs backups from the app process.
  DIRECT_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET too short'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET too short'),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(604800),
  // True sliding inactivity timeout (spec §13.1: "15 minutes inactivity for
  // pharmacist-role users") — distinct from JWT_ACCESS_TTL, which is a fixed
  // expiry from token issuance. Enforced in middleware/auth.ts against
  // User.lastActivityAt, independent of whether the access token itself has
  // expired yet. Seconds, same unit as the JWT TTLs.
  SESSION_INACTIVITY_TIMEOUT: z.coerce.number().default(900),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  // Rate limiting (tunable per environment). A value <= 0 disables the limiter
  // entirely — used for load testing, where 200 concurrent users would trip a
  // fixed per-minute cap. Defaults preserve the original hardcoded behavior.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),

  // On-demand DB backups (admin console). PG_DUMP_PATH assumes pg_dump is on
  // PATH unless overridden (e.g. a portable/non-standard Postgres install).
  PG_DUMP_PATH: z.string().default('pg_dump'),
  BACKUP_DIR: z.string().default('backups'),
  // Automated daily backup job (spec §13.2) prunes anything older than this.
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),

  // Background job queue (spec §16: "background job queues... for OCR
  // processing, report generation, and notification sending"). Unset =
  // in-process queue (default, no infra needed); set to a real Redis
  // connection string to switch the same queue code onto Bull. See
  // services/queue.ts.
  REDIS_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message instead of crashing deep in the app.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
