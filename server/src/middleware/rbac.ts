import { NextFunction, Request, Response } from 'express';
import { AuthContext } from '../types/express';
import { forbidden, unauthorized } from '../utils/httpError';
import { PermissionKey } from '../constants/permissions';

/**
 * Route guard: require ALL of the given permission keys.
 * Permissions are read from the DB-backed set on the AuthContext.
 */
export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    const missing = required.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length > 0) {
      return next(forbidden(`Missing permission(s): ${missing.join(', ')}`));
    }
    next();
  };
}

/** Require any one of the given permissions. */
export function requireAnyPermission(...anyOf: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    if (!anyOf.some((p) => req.auth!.permissions.has(p))) {
      return next(forbidden(`Requires one of: ${anyOf.join(', ')}`));
    }
    next();
  };
}

export const isOwner = (auth: AuthContext): boolean => auth.role === 'SYSTEM_OWNER';

/**
 * Central location-isolation check. The spec requires cross-location access to
 * be blocked at the API layer — every controller touching location-scoped data
 * calls this before returning it.
 *
 * - SYSTEM_OWNER may access any location.
 * - Everyone else may only access their assigned location.
 */
export function assertLocationAccess(auth: AuthContext, targetLocationId: string | null): void {
  if (isOwner(auth)) return;
  if (!auth.locationId) {
    throw forbidden('User has no assigned location');
  }
  if (targetLocationId !== null && targetLocationId !== auth.locationId) {
    throw forbidden('Cross-location access denied');
  }
}

/**
 * Resolve which location a query should be scoped to.
 * - Owner may optionally target a specific location (?pharmacyId=...); if none
 *   given, returns null meaning "all locations".
 * - Non-owner is always forced to their own location, ignoring any override.
 */
export function resolveLocationScope(auth: AuthContext, requested?: string | null): string | null {
  if (isOwner(auth)) return requested ?? null;
  return auth.locationId;
}
