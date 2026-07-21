import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../src/config/env';
import { pruneOldBackups, listBackups } from '../src/services/backup';

// env.BACKUP_DIR is a plain (unfrozen) object property — safe to swap for the
// duration of this test and restore after, without touching the real backups
// directory or needing pg_dump (createBackup itself isn't under test here).
describe('Automated backup pruning', () => {
  let tmpDir: string;
  let originalBackupDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pms-backup-test-'));
    originalBackupDir = env.BACKUP_DIR;
    env.BACKUP_DIR = tmpDir;
  });

  afterEach(async () => {
    env.BACKUP_DIR = originalBackupDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function makeFakeBackup(isoStamp: string, ageDays: number): Promise<string> {
    const filename = `backup-${isoStamp}.dump`;
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, 'fake dump content');
    const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await fs.utimes(filePath, mtime, mtime);
    return filename;
  }

  it('deletes backups older than the retention window, keeps recent ones', async () => {
    const oldFile = await makeFakeBackup('2020-01-01T00-00-00-000Z', 40);
    const recentFile = await makeFakeBackup('2020-01-02T00-00-00-000Z', 1);

    const result = await pruneOldBackups(30);
    expect(result.deleted).toBe(1);

    const remaining = (await listBackups()).map((b) => b.filename);
    expect(remaining).not.toContain(oldFile);
    expect(remaining).toContain(recentFile);
  });

  it('deletes nothing when everything is within the retention window', async () => {
    await makeFakeBackup('2020-01-03T00-00-00-000Z', 5);
    await makeFakeBackup('2020-01-04T00-00-00-000Z', 10);

    const result = await pruneOldBackups(30);
    expect(result.deleted).toBe(0);
    expect(await listBackups()).toHaveLength(2);
  });

  it('never touches a file that does not match the generated-filename pattern', async () => {
    const foreignFile = path.join(tmpDir, 'not-a-backup.txt');
    await fs.writeFile(foreignFile, 'hands off');
    const oldMtime = new Date(Date.now() - 999 * 24 * 60 * 60 * 1000);
    await fs.utimes(foreignFile, oldMtime, oldMtime);

    await pruneOldBackups(30);
    await expect(fs.access(foreignFile)).resolves.toBeUndefined();
  });
});
