import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import * as authService from './auth.service';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const mfaTokenSchema = z.object({
  token: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, mfaToken } = loginSchema.parse(req.body);
  const result = await authService.login(email, password, req, mfaToken);
  res.json(result);
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refresh(refreshToken);
  res.json(result);
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('refreshToken is required');
  await authService.logout(parsed.data.refreshToken);
  res.status(204).send();
});

/** Request a password-reset email. Always 204 (no account enumeration). */
export const forgotPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotSchema.parse(req.body);
  await authService.requestPasswordReset(email, req);
  res.status(204).send();
});

/** Complete a password reset with a valid token. */
export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = resetSchema.parse(req.body);
  await authService.resetPassword(token, newPassword, req);
  res.status(204).send();
});

/** Returns the currently authenticated user's profile + permissions. */
export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    include: {
      role: true,
      pharmacy: { select: { id: true, name: true, code: true, province: true } },
    },
  });
  if (!user) throw unauthorized();

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role.name,
    pharmacy: user.pharmacy,
    mfaEnabled: user.mfaEnabled,
    permissions: [...req.auth.permissions],
  });
});

// --- MFA (TOTP) enrolment ---

/** Begin enrolment: returns a secret + otpauth URL for the authenticator app. */
export const mfaSetupHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await authService.setupMfa(req.auth.userId);
  res.json(result);
});

/** Confirm enrolment by proving a valid code. */
export const mfaEnableHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { token } = mfaTokenSchema.parse(req.body);
  await authService.enableMfa(req.auth.userId, token, req);
  res.status(204).send();
});

/** Turn MFA off (requires a current valid code). */
export const mfaDisableHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { token } = mfaTokenSchema.parse(req.body);
  await authService.disableMfa(req.auth.userId, token, req);
  res.status(204).send();
});
