import { pino } from 'pino';
import { env, isTest } from '../config/env.js';

const transport =
  env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined;

export const logger = pino({
  level: isTest || process.env.VITEST === 'true' ? 'silent' : env.LOG_LEVEL,
  transport,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'currentPassword',
      'newPassword',
      'passwordHash',
    ],
    censor: '[redacted]',
  },
});
