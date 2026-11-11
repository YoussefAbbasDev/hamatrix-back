import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  app,
  authHeader,
  createProduct,
  idempotencyKey,
} from './helpers.js';

let headers;

beforeEach(async () => {
  headers = await authHeader();
});

describe('products', () => {
  it('creates a product with an auto SKU and an opening stock movement', async () => {
    const res = await createProduct(headers, {
      name: 'كوكاكولا',
      sellingPriceMinor: 1500,
      purchasePriceMinor: 900,
      stockQty: 24,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.product.sku).toBe('PRD-0001');
    expect(res.body.data.product.stockQty).toBe(24);
    expect(res.body.data.product.availableQty).toBe(24);

    const detail = await request(app)
      .get(`/api/v1/products/${res.body.data.product.id}`)
      .set(headers);
    expect(detail.body.data.movements[0].type).toBe('initial');
    expect(detail.body.data.movements[0].qtyAfter).toBe(24);
  });

  it('updates prices and accepts a category', async () => {
    const category = await request(app)
      .post('/api/v1/product-categories')
      .set(headers)
      .send({ name: 'مشروبات باردة' });
    expect(category.status).toBe(201);

    const product = await createProduct(headers, { name: 'عصير' });
    const res = await request(app)
      .patch(`/api/v1/products/${product.body.data.product.id}`)
      .set(headers)
      .send({
        sellingPriceMinor: 2000,
        purchasePriceMinor: 1000,
        categoryId: category.body.data.category.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.product.sellingPriceMinor).toBe(2000);
    expect(res.body.data.product.category.name).toBe('مشروبات باردة');
  });

  it('reports low stock products', async () => {
    await createProduct(headers, { name: 'شيبسي', stockQty: 2, minStockQty: 3 });

    const res = await request(app).get('/api/v1/products/low-stock').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe('شيبسي');
  });

  it('reserves stock for open visits without deducting it', async () => {
    const product = await createProduct(headers, { name: 'مياه', stockQty: 5 });
    const productId = product.body.data.product.id;

    const visit = await request(app).post('/api/v1/visits').set(headers).send({});
    const visitId = visit.body.data.visit.id;

    const added = await request(app)
      .post(`/api/v1/visits/${visitId}/items`)
      .set(headers)
      .send({ productId, qty: 4 });
    expect(added.status).toBe(200);

    const listed = await request(app)
      .get(`/api/v1/products?q=${encodeURIComponent('مياه')}`)
      .set(headers);
    expect(listed.body.data.products[0].reservedQty).toBe(4);
    expect(listed.body.data.products[0].availableQty).toBe(1);

    const oversell = await request(app)
      .post(`/api/v1/visits/${visitId}/items`)
      .set(headers)
      .send({ productId, qty: 2 });
    expect(oversell.status).toBe(422);
    expect(oversell.body.error.code).toBe('INSUFFICIENT_STOCK');
  });
});

describe('inventory', () => {
  it('stocks in with purchase price and supplier, and is idempotent', async () => {
    const product = await createProduct(headers, { name: 'شاي', stockQty: 0 });
    const productId = product.body.data.product.id;
    const key = idempotencyKey();
    const payload = {
      productId,
      qty: 10,
      unitCostMinor: 500,
      supplierName: 'مورد الجملة',
    };

    const first = await request(app)
      .post('/api/v1/inventory/stock-in')
      .set(headers)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.body.data.product.stockQty).toBe(10);
    expect(first.body.data.product.purchasePriceMinor).toBe(500);

    const replay = await request(app)
      .post('/api/v1/inventory/stock-in')
      .set(headers)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.data.product.stockQty).toBe(10);

    const movements = await request(app)
      .get(`/api/v1/inventory/movements?productId=${productId}`)
      .set(headers);
    expect(movements.body.data.movements).toHaveLength(1);
    expect(movements.body.data.movements[0].supplierName).toBe('مورد الجملة');
    expect(movements.body.data.movements[0].type).toBe('purchase');
  });

  it('adjusts stock and refuses to go negative', async () => {
    const product = await createProduct(headers, { name: 'سكر', stockQty: 3 });
    const productId = product.body.data.product.id;

    const ok = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set(headers)
      .send({ productId, qtyDelta: -2, type: 'damage', reason: 'تلف' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.result.product.stockQty).toBe(1);

    const bad = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set(headers)
      .send({ productId, qtyDelta: -5, type: 'adjustment', reason: 'جرد' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('STOCK_NEGATIVE');
  });

  it('returns a valuation summary', async () => {
    await createProduct(headers, {
      name: 'شوكولاتة',
      stockQty: 10,
      purchasePriceMinor: 700,
      sellingPriceMinor: 1200,
    });

    const res = await request(app).get('/api/v1/inventory/valuation').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.totalCostMinor).toBe(7000);
    expect(res.body.data.totalRetailMinor).toBe(12000);
  });
});
