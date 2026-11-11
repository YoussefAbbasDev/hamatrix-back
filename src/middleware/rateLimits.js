import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { isTest } from '../config/env.js';

const skipLimits = isTest || process.env.VITEST === 'true' || process.env.E2E === 'true';

const passThrough = (req, res, next) => next();

const limitHandler = (req, res) => {
  res.status(429).json({
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'محاولات كثيرة. حاول بعد قليل.',
      requestId: res.locals.requestId,
    },
  });
};

export const globalLimiter = skipLimits
  ? passThrough
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: limitHandler,
    });

export const loginLimiter = skipLimits
  ? passThrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      handler: limitHandler,
    });
