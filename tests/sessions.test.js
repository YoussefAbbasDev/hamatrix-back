import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { app, authHeader, createDevice, startSession, backdateSession } from './helpers.js';
import { Device } from '../src/modules/devices/model.js';

let headers;

beforeEach(async () => {
  headers = await authHeader();
});

describe('sessions', () => {
  it('starts an open session and occupies the device', async () => {
    const created = await createDevice(headers, { name: 'PC-01', hourlyPriceMinor: 3000 });
    const deviceId = created.body.data.device.id;

    const res = await startSession(headers, deviceId);

    expect(res.status).toBe(201);
    expect(res.body.data.session.status).toBe('active');
    expect(res.body.data.session.ratePerHourMinor).toBe(3000);
    expect(res.body.data.session.billingMode).toBe('open');
    expect(res.body.data.visitId).toEqual(expect.any(String));

    const device = await request(app).get(`/api/v1/devices/${deviceId}`).set(headers);
    expect(device.body.data.device.status).toBe('occupied');
    expect(device.body.data.device.currentSession.id).toBe(res.body.data.session.id);
  });

  it('snapshots the selected pricing option rate', async () => {
    const created = await createDevice(headers, {
      name: 'PS-01',
      hourlyPriceMinor: 3000,
      pricingOptions: [{ key: 'duo', name: 'زوجي', pricePerHourMinor: 4000 }],
    });

    const res = await startSession(headers, created.body.data.device.id, {
      pricingOptionKey: 'duo',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.session.ratePerHourMinor).toBe(4000);
    expect(res.body.data.session.pricingOptionName).toBe('زوجي');
  });

  it('refuses a second session on the same device', async () => {
    const created = await createDevice(headers, { name: 'PC-01' });
    await startSession(headers, created.body.data.device.id);

    const second = await startSession(headers, created.body.data.device.id);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DEVICE_OCCUPIED');
  });

  it('pauses without billing paused time and resumes', async () => {
    const created = await createDevice(headers, { name: 'PC-01' });
    const started = await startSession(headers, created.body.data.device.id);
    const sessionId = started.body.data.session.id;

    const paused = await request(app)
      .post(`/api/v1/sessions/${sessionId}/pause`)
      .set(headers)
      .send({ reason: 'استراحة' });
    expect(paused.status).toBe(200);
    expect(paused.body.data.session.status).toBe('paused');
    expect(paused.body.data.session.billableMinutes).toBeLessThanOrEqual(1);

    const resumed = await request(app)
      .post(`/api/v1/sessions/${sessionId}/resume`)
      .set(headers);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.session.status).toBe('active');
    expect(resumed.body.data.session.pausedSeconds).toBeGreaterThanOrEqual(0);
  });

  it('ends with the frozen nearest-minute charge and frees the device', async () => {
    const created = await createDevice(headers, { name: 'PC-01', hourlyPriceMinor: 3000 });
    const deviceId = created.body.data.device.id;
    const started = await startSession(headers, deviceId);
    const sessionId = started.body.data.session.id;

    await backdateSession(sessionId, 1 * 3600 + 23 * 60 + 17);

    const ended = await request(app)
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set(headers)
      .send({});

    expect(ended.status).toBe(200);
    expect(ended.body.data.session.status).toBe('ended');
    expect(ended.body.data.session.billableMinutes).toBe(83);
    expect(ended.body.data.session.timeChargeMinor).toBe(4150);
    expect(ended.body.data.alreadyEnded).toBe(false);

    const device = await Device.findById(deviceId).lean();
    expect(device.status).toBe('available');
    expect(device.currentSession).toBeNull();
  });

  it('extends a fixed session and rejects extending open sessions', async () => {
    const device = await createDevice(headers, { name: 'PC-01' });

    const fixed = await startSession(headers, device.body.data.device.id, {
      billingMode: 'fixed',
      durationMinutes: 60,
    });
    expect(fixed.status).toBe(201);

    const extended = await request(app)
      .post(`/api/v1/sessions/${fixed.body.data.session.id}/extend`)
      .set(headers)
      .send({ minutes: 30 });
    expect(extended.status).toBe(200);
    expect(extended.body.data.session.targetActiveMinutes).toBe(90);

    await request(app)
      .post(`/api/v1/sessions/${fixed.body.data.session.id}/end`)
      .set(headers)
      .send({});

    const open = await startSession(headers, device.body.data.device.id);
    expect(open.status).toBe(201);
    const rejected = await request(app)
      .post(`/api/v1/sessions/${open.body.data.session.id}/extend`)
      .set(headers)
      .send({ minutes: 15 });
    expect(rejected.status).toBe(409);
  });

  it('lists the active feed with live numbers', async () => {
    const created = await createDevice(headers, { name: 'PC-01' });
    const started = await startSession(headers, created.body.data.device.id);
    await backdateSession(started.body.data.session.id, 65);

    const res = await request(app).get('/api/v1/sessions/active').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].billableMinutes).toBe(1);
    expect(res.body.data.sessions[0].visit.visitNumber).toEqual(expect.any(String));
  });
});
