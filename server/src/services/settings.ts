import { prisma } from '../config/prisma';

/**
 * Typed system settings backed by the SystemSetting key/value table, with
 * sensible defaults. Includes a short-TTL cache so hot-path checks (maintenance
 * mode) don't hit the DB on every request.
 */
export interface SystemSettings {
  maintenanceMode: boolean;
  dataRetentionDays: number; // audit/prescription retention (>= 10 years)
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLocale: string;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  dataRetentionDays: 3650,
  defaultCurrency: 'CAD',
  defaultTimezone: 'America/Toronto',
  defaultLocale: 'en-CA',
};

let cache: { value: SystemSettings; expires: number } | null = null;
const TTL_MS = 10_000;

export async function getSettings(): Promise<SystemSettings> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const rows = await prisma.systemSetting.findMany();
  const merged: SystemSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      (merged as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      /* ignore malformed values, fall back to default */
    }
  }
  cache = { value: merged, expires: Date.now() + TTL_MS };
  return merged;
}

export async function updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
  for (const [key, value] of Object.entries(patch)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) },
    });
  }
  cache = null; // invalidate
  return getSettings();
}

/** Fast path used by the maintenance middleware. */
export async function isMaintenanceMode(): Promise<boolean> {
  return (await getSettings()).maintenanceMode;
}
