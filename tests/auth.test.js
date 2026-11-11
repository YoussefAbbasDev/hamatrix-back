import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/model.js';
import { AuthSession } from '../src/modules/auth/session.model.js';

const PASSWORD = '123456';
const app = createApp();

async function seedAdmin(overrides = {}) {
  return User.create({
    username: 'admin',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    displayName: 'المدير',
    ...overrides,
  });
}

const login = (agent, body = { username: 'admin', password: PASSWORD }) =>
  agent.post('/api/v1/auth/login').send(body);

describe('auth: login', () => {
  it('signs in with valid credentials and sets an httpOnly refresh cookie', async () => {
    await seedAdmin();
    const agent = request.agent(app);

    const res = await login(agent);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.username).toBe('admin');
    expect(res.body.data).not.toHaveProperty('refreshToken');

    const cookie = res.headers['set-cookie']?.find((item) => item.startsWith('hmx_refresh='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');
  });

  it('rejects a wrong password and counts the failure', async () => {
    const user = await seedAdmin();
    const agent = request.agent(app);

    const res = await login(agent, { username: 'admin', password: 'wrong-pass' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');

    const updated = await User.findById(user._id);
    expect(updated.failedLoginCount).toBe(1);
  });

  it('locks the account after five wrong attempts', async () => {
    await seedAdmin();
    const agent = request.agent(app);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await login(agent, { username: 'admin', password: 'nope-nope' });
      expect(res.status).toBe(401);
    }

    const blocked = await login(agent);
    expect(blocked.status).toBe(423);
    expect(blocked.body.error.code).toBe('ACCOUNT_LOCKED');

    const user = await User.findOne({ username: 'admin' });
    expect(user.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('validates the payload', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'ab', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('auth: refresh rotation', () => {
  it('rotates the refresh token and rejects reuse of the old token', async () => {
    await seedAdmin();
    const agent = request.agent(app);
    const first = await login(agent);

    const oldCookie = first.headers['set-cookie']
      .find((item) => item.startsWith('hmx_refresh='))
      .split(';')[0];

    const refreshed = await agent.post('/api/v1/auth/refresh').set('X-Requested-With', 'XMLHttpRequest');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    // Replay the previous token: the whole family must be revoked.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(replay.status).toBe(401);

    const sessions = await AuthSession.find({ revokedAt: null });
    expect(sessions).toHaveLength(0);
  });

  it('requires the XHR header on refresh', async () => {
    await seedAdmin();
    const agent = request.agent(app);
    await login(agent);

    const res = await agent.post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('auth: protected routes', () => {
  it('returns me for a valid access token', async () => {
    await seedAdmin();
    const agent = request.agent(app);
    const res = await login(agent);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe('admin');
  });

  it('rejects missing and malformed tokens', async () => {
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);

    const bad = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer nope');
    expect(bad.status).toBe(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    await seedAdmin();
    const agent = request.agent(app);
    const res = await login(agent);

    const out = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', res.headers['set-cookie'][0].split(';')[0])
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);

    expect(out.status).toBe(204);

    const refreshed = await agent.post('/api/v1/auth/refresh').set('X-Requested-With', 'XMLHttpRequest');
    expect(refreshed.status).toBe(401);
  });
});

describe('auth: change credentials', () => {
  it('updates the username and password, revokes sessions, and lets the new credentials in', async () => {
    const user = await seedAdmin();
    const agent = request.agent(app);
    const res = await login(agent);

    const change = await request(app)
      .patch('/api/v1/auth/credentials')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .send({ currentPassword: PASSWORD, username: 'owner', newPassword: 'new-secret' });

    expect(change.status).toBe(200);
    expect(change.body.data.username).toBe('owner');

    const refreshedUser = await User.findById(user._id).select('+passwordHash');
    expect(refreshedUser.username).toBe('owner');
    expect(refreshedUser.tokenVersion).toBe(user.tokenVersion + 1);

    const sessions = await AuthSession.find({ user: user._id, revokedAt: null });
    expect(sessions).toHaveLength(0);

    const fresh = request.agent(app);
    const oldLogin = await login(fresh);
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(fresh, { username: 'owner', password: 'new-secret' });
    expect(newLogin.status).toBe(200);
  });

  it('refuses a wrong current password', async () => {
    await seedAdmin();
    const agent = request.agent(app);
    const res = await login(agent);

    const change = await request(app)
      .patch('/api/v1/auth/credentials')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .send({ currentPassword: 'not-it', newPassword: 'whatever' });

    expect(change.status).toBe(422);
    expect(change.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses duplicate usernames', async () => {
    await seedAdmin();
    await seedAdmin({ username: 'other' });

    const agent = request.agent(app);
    const res = await login(agent);

    const change = await request(app)
      .patch('/api/v1/auth/credentials')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .send({ currentPassword: PASSWORD, username: 'other' });

    expect(change.status).toBe(409);
  });
});
