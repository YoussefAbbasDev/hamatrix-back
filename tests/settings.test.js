import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/model.js';
import { Settings } from '../src/modules/settings/model.js';

const app = createApp();

async function authHeader() {
  await User.create({
    username: 'admin',
    passwordHash: await bcrypt.hash('123456', 4),
    displayName: 'المدير',
  });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: '123456' });

  return { Authorization: `Bearer ${res.body.data.accessToken}` };
}

describe('settings: read', () => {
  it('exposes public branding without authentication', async () => {
    const res = await request(app).get('/api/v1/settings/public');

    expect(res.status).toBe(200);
    expect(res.body.data.settings.brand.name).toBe('HAMATRIX');
    expect(res.body.data.settings.locale.currency).toBe('EGP');
    expect(res.body.data.settings.locale.timezone).toBe('Africa/Cairo');
    expect(res.body.data.settings).not.toHaveProperty('invoice');
  });

  it('protects the full settings document', async () => {
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });

  it('returns the full settings document to the admin', async () => {
    const headers = await authHeader();
    const res = await request(app).get('/api/v1/settings').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.settings).toHaveProperty('invoice');
    expect(res.body.data.settings.session.defaultBillingMode).toBe('open');
  });
});

describe('settings: update', () => {
  it('merges partial sections, bumps the version, and audits the change', async () => {
    const headers = await authHeader();
    const before = await request(app).get('/api/v1/settings').set(headers);

    const res = await request(app)
      .patch('/api/v1/settings')
      .set(headers)
      .send({
        brand: { name: 'كافيه حماتريكس', accentColor: '#22D3EE' },
        session: { defaultBillingMode: 'fixed', defaultDurationMinutes: 90 },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.brand.name).toBe('كافيه حماتريكس');
    expect(res.body.data.settings.brand.accentColor).toBe('#22D3EE');
    expect(res.body.data.settings.brand.receiptFooter).toBe(before.body.data.settings.brand.receiptFooter);
    expect(res.body.data.settings.session.defaultBillingMode).toBe('fixed');
    expect(res.body.data.settings.version).toBe(before.body.data.settings.version + 1);

    const stored = await Settings.findById('business').lean();
    expect(stored.session.defaultDurationMinutes).toBe(90);
  });

  it('rejects invalid colors and unknown keys', async () => {
    const headers = await authHeader();

    const badColor = await request(app)
      .patch('/api/v1/settings')
      .set(headers)
      .send({ brand: { accentColor: 'red' } });
    expect(badColor.status).toBe(400);

    const unknown = await request(app)
      .patch('/api/v1/settings')
      .set(headers)
      .send({ brand: { whatever: true } });
    expect(unknown.status).toBe(400);

    const empty = await request(app).patch('/api/v1/settings').set(headers).send({});
    expect(empty.status).toBe(400);
  });

  it('rejects an invalid timezone', async () => {
    const headers = await authHeader();

    const res = await request(app)
      .patch('/api/v1/settings')
      .set(headers)
      .send({ locale: { timezone: 'Mars/Olympus' } });

    expect(res.status).toBe(400);
  });

  it('requires authentication to update', async () => {
    const res = await request(app)
      .patch('/api/v1/settings')
      .send({ brand: { name: 'x' } });

    expect(res.status).toBe(401);
  });
});

describe('system', () => {
  it('reports health with a replica set connection', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('up');
    expect(res.body.data.db.connected).toBe(true);
    expect(res.body.data.db.replicaSet).toBe(true);
  });

  it('returns server time', async () => {
    const res = await request(app).get('/api/v1/time');
    expect(res.status).toBe(200);
    expect(Number.isNaN(Date.parse(res.body.data.serverTime))).toBe(false);
  });
});
