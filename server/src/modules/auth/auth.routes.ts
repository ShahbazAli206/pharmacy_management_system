import { Router, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  mfaDisableHandler,
  mfaEnableHandler,
  mfaSetupHandler,
  refreshHandler,
  resetPasswordHandler,
} from './auth.controller';

const router = Router();

// Stricter limit on auth endpoints to blunt credential-stuffing. Configurable
// per environment; a max <= 0 disables it (e.g. load testing).
const authLimiter: RequestHandler =
  env.AUTH_RATE_LIMIT_MAX > 0
    ? rateLimit({
        windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
        max: env.AUTH_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
      })
    : (_req, _res, next) => next();

router.post('/login', authLimiter, loginHandler);
router.post('/refresh', authLimiter, refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', authenticate, meHandler);

// Password reset (rate-limited; token delivered by email).
router.post('/password/forgot', authLimiter, forgotPasswordHandler);
router.post('/password/reset', authLimiter, resetPasswordHandler);

// MFA (TOTP) enrolment — all require an authenticated session.
router.post('/mfa/setup', authenticate, mfaSetupHandler);
router.post('/mfa/enable', authenticate, mfaEnableHandler);
router.post('/mfa/disable', authenticate, mfaDisableHandler);

export default router;
