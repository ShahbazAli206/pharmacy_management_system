import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { RoleName } from '@prisma/client';
import {
  requirePermission,
  requireAnyPermission,
  assertLocationAccess,
  resolveLocationScope,
  isOwner,
} from '../src/middleware/rbac';
import { AuthContext } from '../src/types/express';
import { HttpError } from '../src/utils/httpError';
import { signAccessToken, verifyAccessToken } from '../src/utils/jwt';
import { generateMfaSecret, verifyMfaToken, mfaKeyUri } from '../src/services/mfa';
import { authenticator } from 'otplib';

function ctx(over: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'u1',
    role: 'LOCATION_PARTNER' as RoleName,
    locationId: 'loc-A',
    permissions: new Set<string>(),
    ...over,
  };
}

/** Invoke a guard middleware and return the error it passed to next(), if any. */
function runGuard(mw: (req: Request, res: Response, next: (e?: unknown) => void) => void, auth?: AuthContext) {
  let error: unknown;
  let nextCalled = false;
  const req = { auth } as unknown as Request;
  mw(req, {} as Response, (e?: unknown) => {
    nextCalled = true;
    error = e;
  });
  return { error, nextCalled };
}

describe('RBAC: requirePermission', () => {
  it('allows when the permission is present', () => {
    const { error } = runGuard(requirePermission('patient:read'), ctx({ permissions: new Set(['patient:read']) }));
    expect(error).toBeUndefined();
  });

  it('forbids (403) when a permission is missing', () => {
    const { error } = runGuard(requirePermission('patient:write'), ctx({ permissions: new Set(['patient:read']) }));
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(403);
  });

  it('requires ALL listed permissions', () => {
    const { error } = runGuard(
      requirePermission('patient:read', 'patient:write'),
      ctx({ permissions: new Set(['patient:read']) }),
    );
    expect((error as HttpError).statusCode).toBe(403);
  });

  it('401s when unauthenticated', () => {
    const { error } = runGuard(requirePermission('patient:read'), undefined);
    expect((error as HttpError).statusCode).toBe(401);
  });
});

describe('RBAC: requireAnyPermission', () => {
  it('allows when at least one is present', () => {
    const { error } = runGuard(
      requireAnyPermission('audit:read:all', 'audit:read:location'),
      ctx({ permissions: new Set(['audit:read:location']) }),
    );
    expect(error).toBeUndefined();
  });

  it('forbids when none are present', () => {
    const { error } = runGuard(
      requireAnyPermission('audit:read:all', 'audit:read:location'),
      ctx({ permissions: new Set(['patient:read']) }),
    );
    expect((error as HttpError).statusCode).toBe(403);
  });
});

describe('Location scoping (patient isolation rule)', () => {
  const owner = ctx({ role: 'SYSTEM_OWNER' as RoleName, locationId: null });
  const partner = ctx({ role: 'LOCATION_PARTNER' as RoleName, locationId: 'loc-A' });

  it('owner is recognized and may access any location', () => {
    expect(isOwner(owner)).toBe(true);
    expect(() => assertLocationAccess(owner, 'loc-B')).not.toThrow();
    expect(() => assertLocationAccess(owner, null)).not.toThrow();
  });

  it('partner may access their own location', () => {
    expect(() => assertLocationAccess(partner, 'loc-A')).not.toThrow();
  });

  it('partner is blocked (403) from another location', () => {
    try {
      assertLocationAccess(partner, 'loc-B');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as HttpError).statusCode).toBe(403);
    }
  });

  it('partner with no assigned location is blocked', () => {
    const noLoc = ctx({ role: 'PHARMACIST_IN_CHARGE' as RoleName, locationId: null });
    expect(() => assertLocationAccess(noLoc, 'loc-A')).toThrow(HttpError);
  });

  it('resolveLocationScope: owner may target a location or see all', () => {
    expect(resolveLocationScope(owner, 'loc-B')).toBe('loc-B');
    expect(resolveLocationScope(owner)).toBeNull();
  });

  it('resolveLocationScope: non-owner is forced to their own location', () => {
    // Even if a partner requests another location, they get their own.
    expect(resolveLocationScope(partner, 'loc-B')).toBe('loc-A');
    expect(resolveLocationScope(partner)).toBe('loc-A');
  });
});

describe('JWT access tokens', () => {
  it('round-trips role + locationId claims', () => {
    const token = signAccessToken({ sub: 'u1', role: 'SYSTEM_OWNER' as RoleName, locationId: null });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe('u1');
    expect(claims.role).toBe('SYSTEM_OWNER');
    expect(claims.locationId).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'u1', role: 'CASHIER' as RoleName, locationId: 'loc-A' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});

describe('MFA (TOTP)', () => {
  it('accepts a freshly generated code and rejects a wrong one', () => {
    const secret = generateMfaSecret();
    const code = authenticator.generate(secret);
    expect(verifyMfaToken(secret, code)).toBe(true);
    expect(verifyMfaToken(secret, '000000')).toBe(false);
  });

  it('does not throw on malformed input', () => {
    const secret = generateMfaSecret();
    expect(verifyMfaToken(secret, 'not-a-code')).toBe(false);
  });

  it('builds an otpauth URI naming the issuer and account', () => {
    const uri = mfaKeyUri('user@pharmacy.ca', generateMfaSecret());
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('Pharmacy%20PMS');
  });
});
