import crypto from 'crypto';
import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  generateRefreshToken,
  refreshExpiryDate,
  signAccessToken,
} from '../../utils/jwt';
import { sha256, encryptField, decryptField } from '../../utils/crypto';
import { badRequest, mfaRequired, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { generateMfaSecret, mfaKeyUri, verifyMfaToken } from '../../services/mfa';
import { getNotificationProvider } from '../../services/notifications';
import { ipMatchesAllowList } from '../../utils/ip';

/** Reset tokens live for one hour. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

export async function login(
  email: string,
  password: string,
  req: Request,
  mfaToken?: string,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      pharmacy: { select: { allowedIpRanges: true } },
    },
  });

  if (!user || !user.isActive) {
    await recordAudit({ action: 'LOGIN_FAILED', entity: 'Auth', metadata: { email }, req });
    throw unauthorized('Invalid credentials');
  }

  // Role-based IP whitelisting (spec §13.1): a location-scoped account whose
  // pharmacy has configured an allow-list may only log in from a matching IP.
  // The system owner is unrestricted (they legitimately need access from
  // anywhere). Rejected the same way as bad credentials — the response never
  // discloses that an IP restriction exists, only the audit log does.
  const allowList = user.pharmacy?.allowedIpRanges;
  if (allowList && !ipMatchesAllowList(req.ip ?? '', allowList)) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      entity: 'Auth',
      userId: user.id,
      pharmacyId: user.pharmacyId,
      metadata: { reason: 'ip_not_allowed' },
      req,
    });
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

  // Second factor: when MFA is enabled the password alone is insufficient.
  if (user.mfaEnabled && user.mfaSecret) {
    if (!mfaToken) {
      throw mfaRequired();
    }
    if (!verifyMfaToken(decryptField(user.mfaSecret), mfaToken)) {
      await recordAudit({
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        userId: user.id,
        pharmacyId: user.pharmacyId,
        metadata: { reason: 'bad_mfa_token' },
        req,
      });
      throw unauthorized('Invalid MFA token');
    }
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

  // Also resets the inactivity clock: without this, a user who was already
  // idle-timed-out from a prior session would immediately trip the same
  // check on their very next authenticated request after a fresh login.
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActivityAt: new Date() } });
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

  // Enforce the inactivity timeout here too, not just in the authenticate
  // middleware. Without this check, a client whose access token happens to
  // expire around the same time it went idle (the common case when
  // SESSION_INACTIVITY_TIMEOUT == JWT_ACCESS_TTL, both 15 min by default)
  // would never hit the authenticate-side check at all — it would get a
  // TokenExpiredError first, silently refresh, and the "inactivity" timeout
  // would never actually fire.
  if (stored.user.lastActivityAt) {
    const idleMs = Date.now() - stored.user.lastActivityAt.getTime();
    if (idleMs > env.SESSION_INACTIVITY_TIMEOUT * 1000) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw unauthorized('Session expired due to inactivity');
    }
  }

  // Rotate: revoke the used token and issue a fresh pair. Also bumps the
  // inactivity clock — a client refreshing its access token is, by
  // definition, still actively driving the app.
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
    prisma.user.update({ where: { id: stored.userId }, data: { lastActivityAt: new Date() } }),
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

// ---------------------------------------------------------------------------
// Password reset. A raw token is emailed (via the pluggable notification
// provider); only its SHA-256 hash is persisted. Tokens are single-use and
// expire after one hour. To avoid account enumeration, requesting a reset
// always succeeds regardless of whether the email exists.
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) {
    // Silently no-op so callers cannot probe which emails are registered.
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  // Invalidate any outstanding tokens, then issue a fresh one.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetUrl = `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`;
  await getNotificationProvider().send({
    channel: 'EMAIL',
    to: user.email,
    subject: 'Reset your Pharmacy PMS password',
    body:
      `Hello ${user.firstName},\n\n` +
      `A password reset was requested for your account. Use the link below within ` +
      `one hour to set a new password:\n\n${resetUrl}\n\n` +
      `If you did not request this, you can safely ignore this email.`,
  });

  await recordAudit({
    action: 'UPDATE',
    entity: 'Auth',
    userId: user.id,
    pharmacyId: user.pharmacyId,
    metadata: { passwordReset: 'requested' },
    req,
  });
}

export async function resetPassword(rawToken: string, newPassword: string, req: Request): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  // Update the password, consume the token, and revoke all sessions atomically.
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({
    action: 'UPDATE',
    entity: 'Auth',
    userId: record.userId,
    metadata: { passwordReset: 'completed' },
    req,
  });
}

// ---------------------------------------------------------------------------
// MFA (TOTP) enrolment. The secret is generated on setup and stored
// field-level-encrypted; enrolment only completes once the user proves they
// can produce a valid code (enable), preventing lock-out from a mistyped secret.
// ---------------------------------------------------------------------------

export async function setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();

  const secret = generateMfaSecret();
  await prisma.user.update({
    where: { id: userId },
    // Store encrypted, but leave mfaEnabled false until the user confirms a code.
    data: { mfaSecret: encryptField(secret) },
  });

  return { secret, otpauthUrl: mfaKeyUri(user.email, secret) };
}

export async function enableMfa(userId: string, token: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  if (!user.mfaSecret) throw badRequest('Call MFA setup before enabling');
  if (user.mfaEnabled) throw badRequest('MFA is already enabled');

  if (!verifyMfaToken(decryptField(user.mfaSecret), token)) {
    throw badRequest('Invalid MFA token');
  }

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await recordAudit({
    action: 'UPDATE',
    entity: 'Auth',
    userId,
    pharmacyId: user.pharmacyId,
    metadata: { mfa: 'enabled' },
    req,
  });
}

export async function disableMfa(userId: string, token: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  if (!user.mfaEnabled || !user.mfaSecret) throw badRequest('MFA is not enabled');

  // Require a valid current code to disable, so a hijacked session alone cannot.
  if (!verifyMfaToken(decryptField(user.mfaSecret), token)) {
    throw badRequest('Invalid MFA token');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null },
  });
  await recordAudit({
    action: 'UPDATE',
    entity: 'Auth',
    userId,
    pharmacyId: user.pharmacyId,
    metadata: { mfa: 'disabled' },
    req,
  });
}
