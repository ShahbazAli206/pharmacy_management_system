import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { badRequest } from '../utils/httpError';

const execFileAsync = promisify(execFile);

// Fixed, generated-by-us filename shape only — never derived from user input.
// Guards the download endpoint against path traversal.
const FILENAME_RE = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.dump$/;

function backupDir(): string {
  return path.isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : path.join(process.cwd(), env.BACKUP_DIR);
}

/** Prisma connection strings carry a `?schema=` query param that isn't a valid libpq parameter — pg_dump rejects it outright. */
function toLibpqUrl(prismaUrl: string): string {
  const url = new URL(prismaUrl);
  url.searchParams.delete('schema');
  return url.toString();
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Create an on-demand full-database dump via pg_dump, using the superuser
 * DIRECT_URL connection so the dump isn't RLS-filtered (pg_dump doesn't set
 * our app.is_owner/app.pharmacy_id GUCs, so dumping as the least-privilege
 * pharmacy_app role would silently produce an incomplete backup missing all
 * patient-table rows). All arguments are fixed/generated server-side — never
 * user input — passed as an argv array (execFile, not a shell string), so
 * there is no command-injection surface here.
 */
export async function createBackup(): Promise<BackupInfo> {
  if (!env.DIRECT_URL) {
    throw badRequest('DIRECT_URL is not configured; backups require the superuser connection');
  }
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });

  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
  const filePath = path.join(dir, filename);

  try {
    await execFileAsync(
      env.PG_DUMP_PATH,
      ['--dbname', toLibpqUrl(env.DIRECT_URL), '--format=custom', '--file', filePath],
      { timeout: 10 * 60 * 1000 },
    );
  } catch (e) {
    await fs.rm(filePath, { force: true }); // don't leave a partial/corrupt dump listed as a valid backup
    throw e;
  }

  const stat = await fs.stat(filePath);
  return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
}

export async function listBackups(): Promise<BackupInfo[]> {
  const dir = backupDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const infos = await Promise.all(
    entries
      .filter((f) => FILENAME_RE.test(f))
      .map(async (filename) => {
        const stat = await fs.stat(path.join(dir, filename));
        return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      }),
  );
  return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolves a backup filename to an absolute path, rejecting anything that isn't one of our own generated names. */
export function resolveBackupPath(filename: string): string {
  if (!FILENAME_RE.test(filename)) throw badRequest('Invalid backup filename');
  return path.join(backupDir(), filename);
}

/**
 * Deletes backups older than `retentionDays` (by filesystem mtime). Used by
 * the automated daily backup job — without this, "automated backups" would
 * grow disk usage unboundedly forever. Only ever touches files matching our
 * own generated filename pattern (see FILENAME_RE), same guard as download.
 */
export async function pruneOldBackups(retentionDays: number): Promise<{ deleted: number }> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const all = await listBackups();
  let deleted = 0;
  for (const b of all) {
    if (new Date(b.createdAt).getTime() < cutoff) {
      await fs.rm(resolveBackupPath(b.filename), { force: true });
      deleted++;
    }
  }
  return { deleted };
}
