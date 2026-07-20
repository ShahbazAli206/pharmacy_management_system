import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { unauthorized } from '../utils/httpError';
import { runWithRlsContext } from '../config/rlsContext';
import { env } from '../config/env';

// Only bother writing lastActivityAt when it's this stale, so a burst of
// requests from one active user doesn't turn into a write per request.
const ACTIVITY_WRITE_THROTTLE_MS = 60_000;

/**
 * Verifies the Bearer access token, loads the user's live permission set from
 * the DB permission matrix, and attaches an AuthContext to the request.
 *
 * Permissions come from the DB (not the token) so a revoked/changed permission
 * takes effect on the next request without waiting for token expiry.
 *
 * Also enforces a true sliding inactivity timeout (spec §13.1), which is a
 * different guarantee than the JWT's own fixed expiry: a token that is still
 * technically unexpired is still rejected once the user has gone quiet for
 * longer than SESSION_INACTIVITY_TIMEOUT, and all of their refresh tokens are
 * revoked so the client's automatic refresh-on-401 cannot silently resurrect
 * the session.
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

    const now = new Date();
    if (user.lastActivityAt) {
      const idleMs = now.getTime() - user.lastActivityAt.getTime();
      if (idleMs > env.SESSION_INACTIVITY_TIMEOUT * 1000) {
        await prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
        throw unauthorized('Session expired due to inactivity');
      }
    }
    if (!user.lastActivityAt || now.getTime() - user.lastActivityAt.getTime() > ACTIVITY_WRITE_THROTTLE_MS) {
      // Fire-and-forget: a lost activity ping under load must never fail the request.
      void prisma.user.update({ where: { id: user.id }, data: { lastActivityAt: now } }).catch(() => {});
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
