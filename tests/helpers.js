import { randomUUID } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/model.js';
import { Session } from '../src/modules/sessions/model.js';

export const app = createApp();
export const PASSWORD = '123456';

export function idempotencyKey() {
  return randomUUID();
}

export async function seedAdmin(overrides = {}) {
  return User.create({
    username: 'admin',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    displayName: 'المدير',
    ...overrides,
  });
}

export async function authHeader() {
  await seedAdmin();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: PASSWORD });
  return { Authorization: `Bearer ${res.body.data.accessToken}` };
}

export async function createDevice(headers, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/devices')
    .set(headers)
    .send({
      name: overrides.name ?? 'جهاز تجريبي',
      hourlyPriceMinor: overrides.hourlyPriceMinor ?? 3000,
      ...overrides,
    });
  return res;
}

export async function createProduct(headers, overrides = {}) {
  return request(app)
    .post('/api/v1/products')
    .set(headers)
    .send({
      name: overrides.name ?? 'بيبسي',
      sellingPriceMinor: overrides.sellingPriceMinor ?? 1500,
      purchasePriceMinor: overrides.purchasePriceMinor ?? 900,
      stockQty: overrides.stockQty ?? 20,
      minStockQty: overrides.minStockQty ?? 2,
      ...overrides,
    });
}

export async function startSession(headers, deviceId, overrides = {}) {
  return request(app)
    .post('/api/v1/sessions')
    .set(headers)
    .send({ deviceId, ...overrides });
}

/** Moves the running session's clock backwards so billing has something to bill. */
export async function backdateSession(sessionId, seconds) {
  const session = await Session.findById(sessionId);
  const start = new Date(Date.now() - seconds * 1000);
  session.startedAt = start;
  session.activeSegments[0].start = start;
  await session.save();
  return session;
}
