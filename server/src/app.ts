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
  app.use(morgan(isProd ? 'combined' : 'dev'));

  // Baseline global rate limit; auth routes add a stricter one of their own.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Read-only lockdown when maintenance mode is enabled (settings-driven).
  app.use('/api', maintenanceGuard);
  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
