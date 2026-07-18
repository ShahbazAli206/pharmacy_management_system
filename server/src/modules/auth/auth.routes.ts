import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

// Stricter limit on auth endpoints to blunt credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

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
