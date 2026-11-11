/**
 * Serverless entry point (Vercel and any host that expects a request handler).
 *
 * Vercel's Express integration looks for `src/index.js`, imports the default
 * export and forwards every request to it, so `req.url` keeps its original path
 * and the Express router works unchanged.
 *
 * The database connection is created once per instance and reused by every
 * later invocation: serverless containers are frozen between requests, and
 * reconnecting on each call would add hundreds of milliseconds and exhaust the
 * Atlas connection limit.
 */
import express from 'express';
import { createApp } from './app.js';
import { connectDb } from './db/connect.js';
import { ensureBootstrap } from './db/seed.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { errors } from './utils/errors.js';

let readyPromise = null;

async function bootstrap() {
  await connectDb();
  await ensureBootstrap();
  logger.info('Serverless bootstrap complete');
}

/** Resolves once this instance is connected; failed attempts are retried. */
function ready() {
  if (!readyPromise) {
    readyPromise = bootstrap().catch((error) => {
      readyPromise = null;
      logger.error({ err: error }, 'Serverless bootstrap failed');
      throw errors.unavailable();
    });
  }
  return readyPromise;
}

const app = express();

app.use(async (req, res, next) => {
  try {
    await ready();
    next();
  } catch (error) {
    next(error);
  }
});

app.use(createApp());
app.use(errorHandler);

export default app;
