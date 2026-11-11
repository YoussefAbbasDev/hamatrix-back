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
import { Product } from '../src/modules/products/model.js';
import { Invoice } from '../src/modules/invoices/model.js';
import { Visit } from '../src/modules/visits/model.js';
import { Session } from '../src/modules/sessions/model.js';
import { StockMovement } from '../src/modules/inventory/movement.model.js';

let headers;

beforeEach(async () => {
  headers = await authHeader();
});

it('checks out playing time plus products and deducts stock once', async () => {
  const device = await createDevice(headers, { name: 'PC-01', hourlyPriceMinor: 3000 });
  const product = await createProduct(headers, {
    name: 'بيبسي',
    stockQty: 10,
    sellingPriceMinor: 1500,
    purchasePriceMinor: 900,
  });
  const productId = product.body.data.product.id;

  const started = await startSession(headers, device.body.data.device.id);
  const { sessionId, visitId } = {
    sessionId: started.body.data.session.id,
    visitId: started.body.data.visitId,
  };
  expect(visitId).toEqual(expect.any(String));

  await backdateSession(sessionId, 1 * 3600 + 23 * 60 + 17);

  const added = await request(app)
    .post(`/api/v1/visits/${visitId}/items`)
    .set(headers)
    .send({ productId, qty: 2 });
  expect(added.status).toBe(200);
  expect(added.body.data.visit.totals.itemsSubtotalMinor).toBe(3000);

  // BR-60: stock is only reserved while the visit is open.
  expect((await Product.findById(productId).lean()).stockQty).toBe(10);

  const key = idempotencyKey();
  const checkout = await request(app)
    .post(`/api/v1/visits/${visitId}/checkout`)
    .set(headers)
    .set('Idempotency-Key', key)
    .send({ adjustmentMinor: -500, adjustmentNote: 'خصم' });

  expect(checkout.status).toBe(201);
  const invoice = checkout.body.data.invoice;
  expect(invoice.type).toBe('session');
  expect(invoice.lines.filter((line) => line.kind === 'time')).toHaveLength(1);
  expect(invoice.lines.filter((line) => line.kind === 'product')).toHaveLength(1);
  expect(invoice.subtotalMinor).toBe(7150);
  expect(invoice.adjustmentMinor).toBe(-500);
  expect(invoice.totalMinor).toBe(6650);

  expect((await Product.findById(productId).lean()).stockQty).toBe(8);

  const deviceAfter = await request(app)
    .get(`/api/v1/devices/${device.body.data.device.id}`)
    .set(headers);
  expect(deviceAfter.body.data.device.status).toBe('available');

  // Replaying the same idempotency key returns the same invoice, no second sale.
  const replay = await request(app)
    .post(`/api/v1/visits/${visitId}/checkout`)
    .set(headers)
    .set('Idempotency-Key', key)
    .send({ adjustmentMinor: -500, adjustmentNote: 'خصم' });
  expect(replay.status).toBe(201);
  expect(replay.body.data.invoice.invoiceNumber).toBe(invoice.invoiceNumber);
  expect(replay.body.meta.replayed).toBe(true);
  expect((await Product.findById(productId).lean()).stockQty).toBe(8);
});

it('rejects checkout of a visit with nothing to bill', async () => {
  const visit = await request(app).post('/api/v1/visits').set(headers).send({});

  const res = await request(app)
    .post(`/api/v1/visits/${visit.body.data.visit.id}/checkout`)
    .set(headers)
    .set('Idempotency-Key', idempotencyKey())
    .send({});

  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VISIT_EMPTY');
});

it('keeps the bill open after gaming ends and bills products added later', async () => {
  const device = await createDevice(headers, { name: 'PC-02' });
  const product = await createProduct(headers, { name: 'شيبسي', stockQty: 5 });

  const started = await startSession(headers, device.body.data.device.id);
  const visitId = started.body.data.visitId;
  await backdateSession(started.body.data.session.id, 60 * 30);

  const ended = await request(app)
    .post(`/api/v1/sessions/${started.body.data.session.id}/end`)
    .set(headers)
    .send({});
  expect(ended.status).toBe(200);

  // Add food after gaming stopped: same visit, same invoice.
  const added = await request(app)
    .post(`/api/v1/visits/${visitId}/items`)
    .set(headers)
    .send({ productId: product.body.data.product.id, qty: 1 });
  expect(added.status).toBe(200);
  expect(added.body.data.visit.activeSession).toBeNull();

  const checkout = await request(app)
    .post(`/api/v1/visits/${visitId}/checkout`)
    .set(headers)
    .set('Idempotency-Key', idempotencyKey())
    .send({});
  expect(checkout.status).toBe(201);
  expect(checkout.body.data.invoice.lines).toHaveLength(2);
});

it('hard deletes an invoice, restores stock and removes every trace', async () => {
  const device = await createDevice(headers, { name: 'PC-03' });
  const product = await createProduct(headers, { name: 'مياه', stockQty: 6 });

  const started = await startSession(headers, device.body.data.device.id);
  await request(app)
    .post(`/api/v1/visits/${started.body.data.visitId}/items`)
    .set(headers)
    .send({ productId: product.body.data.product.id, qty: 2 });

  const checkout = await request(app)
    .post(`/api/v1/visits/${started.body.data.visitId}/checkout`)
    .set(headers)
    .set('Idempotency-Key', idempotencyKey())
    .send({});
  expect(checkout.status).toBe(201);

  const invoiceId = checkout.body.data.invoice.id;
  const invoiceNumber = checkout.body.data.invoice.invoiceNumber;
  expect((await Product.findById(product.body.data.product.id).lean()).stockQty).toBe(4);
  expect(
    await StockMovement.countDocuments({ type: 'sale' }),
  ).toBe(1);

  const wrong = await request(app)
    .delete(`/api/v1/invoices/${invoiceId}`)
    .set(headers)
    .send({ confirmInvoiceNumber: 'HAM-000000-0000' });
  expect(wrong.status).toBe(422);
  expect(wrong.body.error.code).toBe('INVOICE_CONFIRMATION_MISMATCH');

  const deleted = await request(app)
    .delete(`/api/v1/invoices/${invoiceId}`)
    .set(headers)
    .send({ confirmInvoiceNumber: invoiceNumber });
  expect(deleted.status).toBe(204);

  expect(await Invoice.countDocuments()).toBe(0);
  expect(await Visit.countDocuments()).toBe(0);
  expect(await Session.countDocuments()).toBe(0);
  expect(await StockMovement.countDocuments({ type: 'sale' })).toBe(0);
  expect((await Product.findById(product.body.data.product.id).lean()).stockQty).toBe(6);

  const gone = await request(app).get(`/api/v1/invoices/${invoiceId}`).set(headers);
  expect(gone.status).toBe(404);
});

describe('quick sale', () => {
  it('sells without a session and deducts stock immediately', async () => {
    const product = await createProduct(headers, { name: 'ريد بول', stockQty: 4 });

    const res = await request(app)
      .post('/api/v1/sales')
      .set(headers)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        items: [{ productId: product.body.data.product.id, qty: 3 }],
        playerName: 'زبون',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.invoice.type).toBe('quick_sale');
    expect(res.body.data.invoice.totalMinor).toBe(4500);
    expect((await Product.findById(product.body.data.product.id).lean()).stockQty).toBe(1);

    const list = await request(app).get('/api/v1/sales').set(headers);
    expect(list.body.data.invoices).toHaveLength(1);
    expect(list.body.data.invoices[0].type).toBe('quick_sale');
  });

  it('blocks overselling and rolls the whole sale back', async () => {
    const product = await createProduct(headers, { name: 'قهوة', stockQty: 2 });

    const res = await request(app)
      .post('/api/v1/sales')
      .set(headers)
      .set('Idempotency-Key', idempotencyKey())
      .send({ items: [{ productId: product.body.data.product.id, qty: 5 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await Invoice.countDocuments()).toBe(0);
    expect(await Visit.countDocuments()).toBe(0);
    expect((await Product.findById(product.body.data.product.id).lean()).stockQty).toBe(2);
  });
});
