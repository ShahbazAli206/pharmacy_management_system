import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'BAD_REQUEST');
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg, 'UNAUTHORIZED');
/** Credentials were valid but a TOTP code is required to complete login. */
export const mfaRequired = (msg = 'MFA token required') => new HttpError(401, msg, 'MFA_REQUIRED');
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'NOT_FOUND');

/** Wraps async route handlers so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
