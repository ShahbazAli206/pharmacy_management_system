import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import * as authService from './auth.service';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const result = await authService.login(email, password, req);
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
