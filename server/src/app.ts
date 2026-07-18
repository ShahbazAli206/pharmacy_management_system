import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { maintenanceGuard } from './middleware/maintenance';

export function createApp() {
  const app = express();

  // Behind a reverse proxy in production so req.ip reflects the real client.
  if (isProd) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  // HTTP request logging — silenced under NODE_ENV=test (unit/load runs) to keep
  // output clean; on everywhere else.
  if (env.NODE_ENV !== 'test') app.use(morgan(isProd ? 'combined' : 'dev'));

  // Baseline global rate limit; auth routes add a stricter one of their own.
  // Configurable per environment; a max <= 0 disables it (e.g. load testing).
  if (env.RATE_LIMIT_MAX > 0) {
    app.use(
      rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: env.RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  // Read-only lockdown when maintenance mode is enabled (settings-driven).
  app.use('/api', maintenanceGuard);
  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
