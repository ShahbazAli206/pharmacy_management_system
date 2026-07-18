import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { verifyPassword } from '../../utils/password';
import {
  generateRefreshToken,
  refreshExpiryDate,
  signAccessToken,
} from '../../utils/jwt';
import { sha256 } from '../../utils/crypto';
import { unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    pharmacyId: string | null;
    mfaEnabled: boolean;
    permissions: string[];
  };
}

export async function login(email: string, password: string, req: Request): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  if (!user || !user.isActive) {
    await recordAudit({ action: 'LOGIN_FAILED', entity: 'Auth', metadata: { email }, req });
    throw unauthorized('Invalid credentials');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      entity: 'Auth',
      userId: user.id,
      pharmacyId: user.pharmacyId,
      req,
    });
    throw unauthorized('Invalid credentials');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role.name,
    locationId: user.pharmacyId,
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiryDate(),
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    action: 'LOGIN',
    entity: 'Auth',
    userId: user.id,
    pharmacyId: user.pharmacyId,
    req,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      pharmacyId: user.pharmacyId,
      mfaEnabled: user.mfaEnabled,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    },
  };
}

export async function refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = sha256(rawToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { role: true } } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    throw unauthorized('Invalid or expired refresh token');
  }

  // Rotate: revoke the used token and issue a fresh pair.
  const newRefresh = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: sha256(newRefresh),
        expiresAt: refreshExpiryDate(),
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: stored.user.id,
    role: stored.user.role.name,
    locationId: stored.user.pharmacyId,
  });

  return { accessToken, refreshToken: newRefresh };
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
