import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { app, authHeader, createDevice } from './helpers.js';

let headers;

beforeEach(async () => {
  headers = await authHeader();
});

describe('devices: CRUD', () => {
  it('creates a device with an auto code and pricing options', async () => {
    const res = await createDevice(headers, {
      name: 'PC-01',
      hourlyPriceMinor: 3000,
      pricingOptions: [
        { key: 'solo', name: 'فردي', pricePerHourMinor: 3000 },
        { key: 'duo', name: 'زوجي', pricePerHourMinor: 4000 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.device.code).toBe('DEV-001');
    expect(res.body.data.device.status).toBe('available');
    expect(res.body.data.device.pricingOptions).toHaveLength(2);
    expect(res.body.data.device.currentSession).toBeNull();
  });

  it('lists devices with pagination metadata', async () => {
    await createDevice(headers, { name: 'A' });
    await createDevice(headers, { name: 'B' });

    const res = await request(app).get('/api/v1/devices').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.devices).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('rejects a duplicate device code', async () => {
    await createDevice(headers, { name: 'A', code: 'PC-01' });
    const duplicate = await createDevice(headers, { name: 'B', code: 'PC-01' });

    expect(duplicate.status).toBe(409);
  });

  it('updates name and hourly price', async () => {
    const created = await createDevice(headers, { name: 'A', hourlyPriceMinor: 3000 });

    const res = await request(app)
      .patch(`/api/v1/devices/${created.body.data.device.id}`)
      .set(headers)
      .send({ name: 'B', hourlyPriceMinor: 3500 });

    expect(res.status).toBe(200);
    expect(res.body.data.device.name).toBe('B');
    expect(res.body.data.device.hourlyPriceMinor).toBe(3500);
  });

  it('soft deletes an idle device', async () => {
    const created = await createDevice(headers, { name: 'A' });

    const res = await request(app)
      .delete(`/api/v1/devices/${created.body.data.device.id}`)
      .set(headers);

    expect(res.status).toBe(204);

    const list = await request(app).get('/api/v1/devices').set(headers);
    expect(list.body.data.devices).toHaveLength(0);
  });
});

describe('devices: maintenance and sessions', () => {
  it('starts and completes maintenance', async () => {
    const created = await createDevice(headers, { name: 'A' });
    const id = created.body.data.device.id;

    const started = await request(app)
      .post(`/api/v1/devices/${id}/maintenance`)
      .set(headers)
      .send({ reason: 'تنظيف' });
    expect(started.status).toBe(200);
    expect(started.body.data.device.status).toBe('maintenance');

    const blocked = await request(app)
      .post('/api/v1/sessions')
      .set(headers)
      .send({ deviceId: id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DEVICE_MAINTENANCE');

    const completed = await request(app)
      .post(`/api/v1/devices/${id}/maintenance/complete`)
      .set(headers);
    expect(completed.status).toBe(200);
    expect(completed.body.data.device.status).toBe('available');
  });

  it('cannot delete a device with a running session', async () => {
    const created = await createDevice(headers, { name: 'A' });
    const id = created.body.data.device.id;

    const session = await request(app)
      .post('/api/v1/sessions')
      .set(headers)
      .send({ deviceId: id });
    expect(session.status).toBe(201);

    const res = await request(app).delete(`/api/v1/devices/${id}`).set(headers);
    expect(res.status).toBe(409);
  });

  it('exposes aggregated device stats', async () => {
    const created = await createDevice(headers, { name: 'A' });
    const id = created.body.data.device.id;

    const res = await request(app)
      .get(`/api/v1/devices/${id}/stats`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.deviceId).toBe(id);
    expect(res.body.data.sessions).toBe(0);
  });
});
