import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { app, authHeader } from './helpers.js';
import { Expense } from '../src/modules/expenses/model.js';

let headers;

beforeEach(async () => {
  headers = await authHeader();
});

describe('expenses', () => {
  it('creates an expense on the Cairo day with a category snapshot', async () => {
    const category = await request(app)
      .post('/api/v1/expense-categories')
      .set(headers)
      .send({ name: 'كهربا' });
    expect(category.status).toBe(201);

    const res = await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({
        title: 'فاتورة الكهرباء',
        amountMinor: 45000,
        categoryId: category.body.data.category.id,
        expenseDate: '2026-02-10',
        note: 'شهر فبراير',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.expense.amountMinor).toBe(45000);
    expect(res.body.data.expense.categoryName).toBe('كهربا');
    expect(res.body.data.expense.expenseDate).toBe('2026-02-09T22:00:00.000Z');
  });

  it('filters by date range and totals the filtered list', async () => {
    await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({ title: 'إيجار', amountMinor: 300000, expenseDate: '2026-01-01' });
    await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({ title: 'إنترنت', amountMinor: 20000, expenseDate: '2026-02-01' });

    const res = await request(app)
      .get('/api/v1/expenses?from=2026-01-01&to=2026-01-31')
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.expenses).toHaveLength(1);
    expect(res.body.data.totalAmountMinor).toBe(300000);
  });

  it('updates and deletes with confirmation', async () => {
    const created = await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({ title: 'صيانة', amountMinor: 10000 });
    const id = created.body.data.expense.id;

    const updated = await request(app)
      .patch(`/api/v1/expenses/${id}`)
      .set(headers)
      .send({ amountMinor: 12000 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.expense.amountMinor).toBe(12000);

    const wrong = await request(app)
      .delete(`/api/v1/expenses/${id}`)
      .set(headers)
      .send({ confirm: false });
    expect(wrong.status).toBe(400);

    const deleted = await request(app)
      .delete(`/api/v1/expenses/${id}`)
      .set(headers)
      .send({ confirm: true });
    expect(deleted.status).toBe(204);
    expect(await Expense.countDocuments()).toBe(0);
  });

  it('validates amounts and unknown keys', async () => {
    const zero = await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({ title: 'صيانة', amountMinor: 0 });
    expect(zero.status).toBe(400);

    const unknown = await request(app)
      .post('/api/v1/expenses')
      .set(headers)
      .send({ title: 'صيانة', amountMinor: 100, extra: true });
    expect(unknown.status).toBe(400);
  });
});
