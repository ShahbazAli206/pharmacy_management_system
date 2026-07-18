import { NextFunction, Request, Response } from 'express';
import { isMaintenanceMode } from '../services/settings';

// Paths that stay writable during maintenance so operators can log in and
// toggle the mode back off.
const ALLOW_PREFIXES = ['/api/auth', '/api/settings', '/api/system'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * When maintenance mode is on, the system becomes read-only: mutating requests
 * are rejected with 503 (except the allow-listed auth/settings paths so the
 * mode can be disabled).
 */
export async function maintenanceGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (READ_METHODS.has(req.method)) return next();
  if (ALLOW_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  try {
    if (await isMaintenanceMode()) {
      res.status(503).json({
        error: { code: 'MAINTENANCE_MODE', message: 'System is in maintenance mode; writes are temporarily disabled.' },
      });
      return;
    }
  } catch {
    // If the settings lookup fails, fail open rather than block all writes.
  }
  next();
}
