import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/ (this package) and the repository root that holds client/dist.
const serverRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(serverRoot, '..');

// server/.env wins; the root .env is only a legacy fallback for older clones.
dotenv.config({
  path: [path.join(serverRoot, '.env'), path.join(repoRoot, '.env')],
});

const boolFromEnv = (fallback) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  }, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  MONGODB_URI: z
    .string()
    .default('mongodb://127.0.0.1:27017/hamatrix?replicaSet=rs0'),

  JWT_ACCESS_SECRET: z
    .string()
    .default('dev-only-secret-change-me-please-0123456789abcdef0123456789'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COOKIE_SECURE: boolFromEnv(false),

  ADMIN_USERNAME: z.string().min(3).max(32).default('admin'),
  ADMIN_PASSWORD: z.string().min(6).max(128).default('123456'),
  ADMIN_DISPLAY_NAME: z.string().min(1).max(64).default('المدير'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  UPLOAD_DIR: z.string().default('uploads'),
  SEED_DEMO: boolFromEnv(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  uploadDirAbs: path.resolve(serverRoot, parsed.data.UPLOAD_DIR),
  repoRoot,
  serverRoot,
});

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd) {
  const problems = [];
  if (env.JWT_ACCESS_SECRET.startsWith('dev-only')) {
    problems.push('JWT_ACCESS_SECRET must be changed in production');
  }
  if (env.JWT_ACCESS_SECRET.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }
  if (env.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS must list the production origin');
  }
  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production:');
    for (const p of problems) {
      // eslint-disable-next-line no-console
      console.error(` - ${p}`);
    }
    process.exit(1);
  }
}
