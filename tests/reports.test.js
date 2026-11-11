import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  app,
  authHeader,
  createDevice,
  createProduct,
  startSession,
  backdateSession,
  idempotencyKey,
} from './helpers.js';
import { DEFAULT_TIMEZONE, dayjs } from '../src/utils/time.js';

let headers;
let today;

beforeEach(async () => {
  headers = await authHeader();
  today = dayjs().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD');
});

async function seedDay() {
  const device = await createDevice(headers, { name: 'PC-01', hourlyPriceMinor: 3000 });
  const product = await createProduct(headers, {
    name: 'بيبسي',
    stockQty: 10,
    sellingPriceMinor: 1500,
    purchasePriceMinor: 900,
  });
  const productId = product.body.data.product.id;

  const started = await startSession(headers, device.body.data.device.id);
  await backdateSession(started.body.data.session.id, 5390);
  await request(app)
    .post(`/api/v1/visits/${started.body.data.visitId}/items`)
    .set(headers)
    .send({ productId, qty: 2 });

  const checkout = await request(app)
    .post(`/api/v1/visits/${started.body.data.visitId}/checkout`)
    .set(headers)
    .set('Idempotency-Key', idempotencyKey())
    .send({});
  expect(checkout.status).toBe(201);

  const sale = await request(app)
    .post('/api/v1/sales')
    .set(headers)
    .set('Idempotency-Key', idempotencyKey())
    .send({ items: [{ productId, qty: 1 }] });
  expect(sale.status).toBe(201);

  await request(app)
    .post('/api/v1/expenses')
    .set(headers)
    .send({ title: 'كهربا', amountMinor: 5000 });

  return { device, product, productId };
}

describe('dashboard', () => {
  it('returns device counts, today revenue split and recent invoices', async () => {
    await seedDay();

    const res = await request(app).get('/api/v1/dashboard').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.devices).toEqual({
      total: 1,
      available: 1,
      occupied: 0,
      maintenance: 0,
    });
    expect(res.body.data.today.revenueMinor).toBe(9000);
    expect(res.body.data.today.gamingMinor).toBe(4500);
    expect(res.body.data.today.cafeteriaMinor).toBe(4500);
    expect(res.body.data.today.cogsMinor).toBe(2700);
    expect(res.body.data.today.expensesMinor).toBe(5000);
    expect(res.body.data.today.netMinor).toBe(1300);
    expect(res.body.data.recent).toHaveLength(2);
    expect(res.body.data.serverTime).toEqual(expect.any(String));
  });

  it('returns chart series and hourly heat', async () => {
    await seedDay();

    const res = await request(app).get('/api/v1/dashboard/charts?days=7').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.revenueSeries).toHaveLength(7);
    expect(res.body.data.revenueSeries.at(-1).date).toBe(today);
    expect(res.body.data.revenueSeries.at(-1).revenueMinor).toBe(9000);
    expect(res.body.data.deviceUtilization[0].sessions).toBe(1);
    expect(res.body.data.hourlyHeat).toHaveLength(24);
  });
});

describe('reports', () => {
  it('summarizes revenue, costs and expenses for the day', async () => {
    await seedDay();

    const res = await request(app)
      .get('/api/v1/reports/summary?period=day')
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.range.fromDate).toBe(today);
    expect(res.body.data.revenue.invoiceCount).toBe(2);
    expect(res.body.data.revenue.revenueMinor).toBe(9000);
    expect(res.body.data.costs.cogsMinor).toBe(2700);
    expect(res.body.data.expenses.totalMinor).toBe(5000);
    expect(res.body.data.netMinor).toBe(1300);
  });

  it('accepts the single-day `date` shorthand on every range report', async () => {
    await seedDay();

    // The records screen sends `period=day&date=YYYY-MM-DD` to all of these.
    for (const path of [
      '/api/v1/reports/summary',
      '/api/v1/reports/records',
      '/api/v1/reports/revenue/daily',
      '/api/v1/reports/devices',
      '/api/v1/reports/products',
    ]) {
      const res = await request(app)
        .get(`${path}?period=day&date=${today}`)
        .set(headers);

      expect(res.status, `${path} should accept date`).toBe(200);
      expect(res.body.data.range.fromDate).toBe(today);
      expect(res.body.data.range.toDate).toBe(today);
    }
  });

  it('builds the day timeline with totals', async () => {
    await seedDay();

    const res = await request(app)
      .get(`/api/v1/reports/records?date=${today}`)
      .set(headers);

    expect(res.status).toBe(200);
    const kinds = res.body.data.items.map((item) => item.kind);
    expect(kinds).toContain('session_ended');
    expect(kinds).toContain('checkout');
    expect(kinds).toContain('quick_sale');
    expect(kinds).toContain('expense');
    expect(res.body.data.totals.revenueMinor).toBe(9000);
    expect(res.body.data.totals.expensesMinor).toBe(5000);
  });

  it('returns the daily revenue series', async () => {
    await seedDay();

    const res = await request(app)
      .get(`/api/v1/reports/revenue/daily?from=${today}&to=${today}`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0].revenueMinor).toBe(9000);
    expect(res.body.data.totals.netMinor).toBe(6300);
  });

  it('ranks devices by revenue and utilization', async () => {
    await seedDay();

    const res = await request(app)
      .get(`/api/v1/reports/devices?from=${today}&to=${today}`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.devices).toHaveLength(1);
    expect(res.body.data.devices[0].revenueMinor).toBe(4500);
    expect(res.body.data.devices[0].activeSeconds).toBeGreaterThan(5300);
    expect(res.body.data.top.deviceId).toBe(res.body.data.devices[0].deviceId);
  });

  it('reports product sales and margins', async () => {
    await seedDay();

    const res = await request(app)
      .get(`/api/v1/reports/products?from=${today}&to=${today}`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].qty).toBe(3);
    expect(res.body.data.products[0].revenueMinor).toBe(4500);
    expect(res.body.data.products[0].marginMinor).toBe(1800);
  });

  it('reports inventory valuation and low stock', async () => {
    await seedDay();

    const res = await request(app).get('/api/v1/reports/inventory').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.productCount).toBe(1);
    expect(res.body.data.totals.totalCostMinor).toBe(6300);
    expect(res.body.data.totals.outOfStockCount).toBe(0);
  });

  it('exports a UTF-8 CSV report', async () => {
    await seedDay();

    const res = await request(app)
      .get(`/api/v1/reports/export?report=summary&period=day`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('إجمالي الإيراد');
    expect(res.text).toContain('90.00');
  });

  it('validates the export report name', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?report=whatever')
      .set(headers);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
