import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { unauthorized } from '../utils/httpError';
import { runWithRlsContext } from '../config/rlsContext';

/**
 * Verifies the Bearer access token, loads the user's live permission set from
 * the DB permission matrix, and attaches an AuthContext to the request.
 *
 * Permissions come from the DB (not the token) so a revoked/changed permission
 * takes effect on the next request without waiting for token expiry.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('Missing or malformed Authorization header');
    }

    const claims = verifyAccessToken(header.slice('Bearer '.length));

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || !user.isActive) {
      throw unauthorized('Account not found or inactive');
    }

    req.auth = {
      userId: user.id,
      role: user.role.name,
      locationId: user.pharmacyId,
      permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
    };

    // Propagate the caller's location scope to PostgreSQL RLS for the rest of
    // this request. Owners are unrestricted; everyone else is pinned to their
    // pharmacy at the database layer, mirroring the API-layer checks.
    runWithRlsContext(
      { isOwner: user.role.name === 'SYSTEM_OWNER', pharmacyId: user.pharmacyId },
      () => next(),
    );
  } catch (err) {
    // Normalize JWT library errors to 401.
    if (err instanceof Error && (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError')) {
      next(unauthorized('Invalid or expired token'));
      return;
    }
    next(err);
  }
}
