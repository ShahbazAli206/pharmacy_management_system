import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { RoleName } from '@prisma/client';
import { env } from '../config/env';

/**
 * Access-token payload. Carries the role + locationId claims the spec mandates,
 * so RBAC and location-scoping can be enforced on every request without an
 * extra DB round trip for identity (permissions are still checked against DB).
 */
export interface AccessTokenClaims {
  sub: string; // user id
  role: RoleName;
  locationId: string | null; // null for SYSTEM_OWNER
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

/** Refresh tokens are opaque random strings; only their hash is stored. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);
}
