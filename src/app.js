import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import pinoHttpModule from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimits.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { systemRouter } from './modules/system/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { devicesRouter } from './modules/devices/routes.js';
import { productsRouter, productCategoriesRouter } from './modules/products/routes.js';
import { inventoryRouter } from './modules/inventory/routes.js';
import { visitsRouter, salesRouter } from './modules/visits/routes.js';
import { sessionsRouter } from './modules/sessions/routes.js';
import { invoicesRouter } from './modules/invoices/routes.js';
import { expensesRouter, expenseCategoriesRouter } from './modules/expenses/routes.js';
import { dashboardRouter, reportsRouter } from './modules/reports/routes.js';

const pinoHttp = pinoHttpModule.pinoHttp ?? pinoHttpModule;

/**
 * Builds the HTTP application. Long-running servers connect to the database at
 * startup; serverless deployments wrap this app with a readiness middleware in
 * `index.js` and reuse one connection per instance.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/api/v1/health'),
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Idempotency-Key',
        'X-Request-Id',
      ],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  // Local logo uploads only exist on a machine with a writable disk; on Vercel
  // the logo is stored in MongoDB as a data URL, so the folder may be absent.
  if (fs.existsSync(env.uploadDirAbs)) {
    app.use(
      '/uploads',
      express.static(env.uploadDirAbs, {
        fallthrough: true,
        maxAge: '7d',
        immutable: true,
        index: false,
      }),
    );
  }

  // Health and server time are intentionally outside the rate limiter.
  app.use('/api/v1', systemRouter);

  app.use('/api/v1', globalLimiter);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/devices', devicesRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/product-categories', productCategoriesRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/visits', visitsRouter);
  app.use('/api/v1/sessions', sessionsRouter);
  app.use('/api/v1/sales', salesRouter);
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/api/v1/expenses', expensesRouter);
  app.use('/api/v1/expense-categories', expenseCategoriesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportsRouter);

  app.get('/api/v1', (req, res) => {
    res.json({
      data: {
        name: 'HAMATRIX API',
        version: '0.2.0',
        docs: 'See API_SPECIFICATION.md',
      },
      meta: { requestId: res.locals.requestId, serverTime: new Date().toISOString() },
    });
  });

  if (env.NODE_ENV === 'production') {
    // On Vercel the frontend is a separate static deployment, so this folder
    // only exists when Express itself hosts the SPA.
    const clientDist = path.resolve(env.repoRoot, 'client', 'dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
      app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
