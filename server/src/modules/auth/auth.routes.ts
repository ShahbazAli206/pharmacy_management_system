import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from './auth.controller';

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

export default router;
