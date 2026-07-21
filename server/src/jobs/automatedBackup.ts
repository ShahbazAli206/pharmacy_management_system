import { createBackup, pruneOldBackups } from '../services/backup';
import { env } from '../config/env';

/**
 * Automated daily backup (spec §13.2: "Automated daily backups to
 * geographically separate Canadian data center"). The geographic-separation
 * half is a hosting/infra decision (where BACKUP_DIR actually points —
 * e.g. a mounted network volume or object storage — not app code); this job
 * is the "automated daily" half: it calls the same pg_dump path the Admin
 * console's manual "Create backup now" button uses, then prunes anything
 * past BACKUP_RETENTION_DAYS so backups don't grow disk usage forever.
 */
export async function runAutomatedBackupJob() {
  const backup = await createBackup();
  const pruned = await pruneOldBackups(env.BACKUP_RETENTION_DAYS);
  return { backup, ...pruned };
}
