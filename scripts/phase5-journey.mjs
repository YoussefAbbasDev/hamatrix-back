/* Phase 5 end-to-end journey against a throwaway API/database. */
import mongoose from 'mongoose';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4011/api/v1';
const MONGO = process.argv[3] ?? 'mongodb://127.0.0.1:27017/hamatrix_smoke?replicaSet=rs0';
const run = `ph5-${Date.now().toString(36)}`;

const results = [];
let token = '';

function record(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ->  ${detail}` : ''}`);
}

function check(label, condition, detail = '') {
  record(Boolean(condition), label, detail);
  return Boolean(condition);
}

function eq(label, actual, expected) {
  return check(label, actual === expected, `expected ${expected}, got ${actual}`);
}

async function call(method, path, { body, headers = {}, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (!raw && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text, headers: res.headers };
}

const idem = () => `ph5-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ── 0. connect for deterministic time travel ────────────────────────────────
await mongoose.connect(MONGO);
const db = mongoose.connection.db;

// ── 1. auth + baseline ──────────────────────────────────────────────────────
const login = await call('POST', '/auth/login', { body: { username: 'admin', password: '123456' } });
if (!eq('login status', login.status, 200)) {
  console.log(login.text.slice(0, 400));
  process.exit(1);
}
token = login.data.data.accessToken;
check('access token present', Boolean(token));

const baselineSummary = await call('GET', '/reports/summary?period=all');
const baseRevenue = baselineSummary.data.data.revenue.revenueMinor;
const baseInvoices = baselineSummary.data.data.revenue.invoiceCount;
const baselineDash = await call('GET', '/dashboard');
const baseDevices = baselineDash.data.data.devices.total;

// ── 2. devices ──────────────────────────────────────────────────────────────
const deviceA = await call('POST', '/devices', {
  body: {
    name: `${run}-PC`,
    code: `${run}-A`.slice(0, 32),
    type: 'PC',
    hourlyPriceMinor: 6000,
    pricingOptions: [
      { key: 'solo', name: 'فردي', pricePerHourMinor: 3000 },
      { key: 'duo', name: 'زوجي', pricePerHourMinor: 4000 },
    ],
  },
});
eq('create device A', deviceA.status, 201);
const deviceAId = deviceA.data.data.device.id;

const deviceB = await call('POST', '/devices', {
  body: {
    name: `${run}-PS`,
    type: 'PS5',
    hourlyPriceMinor: 6000,
  },
});
eq('create device B', deviceB.status, 201);
const deviceBId = deviceB.data.data.device.id;

// ── 3. products + stock in ──────────────────────────────────────────────────
const category = await call('POST', '/product-categories', {
  body: { name: `${run}-drinks`, color: '#22D3EE', sortOrder: 1 },
});
eq('create category', category.status, 201);
const categoryId = category.data.data.category.id;

const product = await call('POST', '/products', {
  body: {
    name: `${run}-cola`,
    sku: `${run}-SKU`,
    categoryId,
    sellingPriceMinor: 1500,
    purchasePriceMinor: 800,
    stockQty: 10,
    minStockQty: 2,
  },
});
eq('create product', product.status, 201);
const productId = product.data.data.product.id;

const stockIn = await call('POST', '/inventory/stock-in', {
  body: { productId, qty: 5, unitCostMinor: 900, supplierName: 'مورد اختبار' },
  headers: { 'Idempotency-Key': idem() },
});
eq('stock in', stockIn.status, 201);

const afterStock = await call('GET', `/products/${productId}`);
eq('stock after delivery', afterStock.data.data.product.stockQty, 15);
eq('purchase price updated', afterStock.data.data.product.purchasePriceMinor, 900);

// ── 4. visit + open session ────────────────────────────────────────────────
const visit = await call('POST', '/visits', { body: { playerName: `${run}-player` } });
eq('create visit', visit.status, 201);
const visitId = visit.data.data.visit.id;

const openSession = await call('POST', `/visits/${visitId}/sessions`, {
  body: { deviceId: deviceAId, billingMode: 'open', pricingOptionKey: 'solo' },
});
eq('start open session', openSession.status, 201);
const openSessionId = openSession.data.data.session.id;
eq('session rate snapshot', openSession.data.data.session.ratePerHourMinor, 3000);
eq('pricing option snapshot', openSession.data.data.session.pricingOptionName, 'فردي');

const deviceOccupied = await call('GET', `/devices/${deviceAId}`);
eq('device occupied', deviceOccupied.data.data.device.status, 'occupied');

// add 2 units (reservation, not deduction)
const itemAdd = await call('POST', `/visits/${visitId}/items`, {
  body: { productId, qty: 2 },
});
eq('add visit item', itemAdd.status, 200);
eq('visit items count', itemAdd.data.data.visit.itemsCount, 2);
const stockUnchanged = await call('GET', `/products/${productId}`);
eq('stock untouched while reserved', stockUnchanged.data.data.product.stockQty, 15);
eq('reserved quantity visible', stockUnchanged.data.data.product.reservedQty, 2);
eq('available excludes reservation', stockUnchanged.data.data.product.availableQty, 13);

// oversell blocked
const oversell = await call('POST', `/visits/${visitId}/items`, {
  body: { productId, qty: 999 },
});
eq('oversell blocked status', oversell.status, 422);
eq('oversell error code', oversell.data?.error?.code, 'INSUFFICIENT_STOCK');

// ── 5. pause / resume ──────────────────────────────────────────────────────
const pause = await call('POST', `/sessions/${openSessionId}/pause`, { body: { reason: 'اختبار' } });
eq('pause status', pause.status, 200);
eq('session paused', pause.data.data.session.status, 'paused');
const pausedSeconds = pause.data.data.session.activeSeconds;
await new Promise((resolve) => setTimeout(resolve, 1200));
const pausedRead = await call('GET', `/sessions/${openSessionId}`);
eq('paused time frozen', pausedRead.data.data.session.activeSeconds, pausedSeconds);

const resume = await call('POST', `/sessions/${openSessionId}/resume`);
eq('resume status', resume.status, 200);
eq('session active again', resume.data.data.session.status, 'active');

// ── 6. deterministic time travel: 65 billable minutes ─────────────────────
const now = Date.now();
await db.collection('sessions').updateOne(
  { _id: new mongoose.Types.ObjectId(openSessionId) },
  {
    $set: {
      startedAt: new Date(now - 65 * 60_000),
      activeSegments: [{ start: new Date(now - 65 * 60_000), end: null }],
      pausedSegments: [],
      status: 'active',
    },
  },
);

const liveOpen = await call('GET', `/sessions/${openSessionId}`);
eq('open billable minutes', liveOpen.data.data.session.billableMinutes, 65);
eq('open live charge', liveOpen.data.data.session.timeChargeMinor, 3250);

// ── 7. fixed session on second device, 10 minutes overtime ────────────────
const fixed = await call('POST', `/visits/${visitId}/sessions`, {
  body: { deviceId: deviceBId, billingMode: 'fixed', durationMinutes: 30 },
});
eq('start fixed session', fixed.status, 201);
const fixedId = fixed.data.data.session.id;
eq('fixed target minutes', fixed.data.data.session.targetActiveMinutes, 30);

await db.collection('sessions').updateOne(
  { _id: new mongoose.Types.ObjectId(fixedId) },
  {
    $set: {
      startedAt: new Date(now - 40 * 60_000),
      activeSegments: [{ start: new Date(now - 40 * 60_000), end: null }],
      status: 'active',
    },
  },
);

const liveFixed = await call('GET', `/sessions/${fixedId}`);
eq('fixed billable minutes (overtime billed)', liveFixed.data.data.session.billableMinutes, 40);
eq('fixed isOverdue', liveFixed.data.data.session.isOverdue, true);
eq('fixed overtime seconds', liveFixed.data.data.session.overtimeSeconds, 600);
eq('fixed live charge', liveFixed.data.data.session.timeChargeMinor, 4000);

const extend = await call('POST', `/sessions/${fixedId}/extend`, { body: { minutes: 15 } });
eq('extend fixed session', extend.status, 200);
eq('target after extend', extend.data.data.session.targetActiveMinutes, 45);

// active feed contains both
const activeFeed = await call('GET', '/sessions/active?limit=100');
const activeIds = (activeFeed.data.data.sessions || []).map((s) => s.id);
check('active feed has open session', activeIds.includes(openSessionId));
check('active feed has fixed session', activeIds.includes(fixedId));

// ── 8. checkout with manual adjustment ────────────────────────────────────
const checkoutKey = idem();
const checkout = await call('POST', `/visits/${visitId}/checkout`, {
  body: { adjustmentMinor: -500, adjustmentNote: 'خصم اختبار' },
  headers: { 'Idempotency-Key': checkoutKey },
});
eq('checkout status', checkout.status, 201);
const invoice = checkout.data.data.invoice;
check('invoice number issued', Boolean(invoice.invoiceNumber), invoice.invoiceNumber);
const timeLinesTotal = invoice.lines
  .filter((line) => line.kind === 'time')
  .reduce((sum, line) => sum + line.lineTotalMinor, 0);
const itemLinesTotal = invoice.lines
  .filter((line) => line.kind === 'product')
  .reduce((sum, line) => sum + line.lineTotalMinor, 0);

eq('invoice time subtotal', timeLinesTotal, 7250);
eq('invoice items subtotal', itemLinesTotal, 3000);
eq('invoice computed total', invoice.subtotalMinor, 10250);
eq('invoice adjustment', invoice.adjustmentMinor, -500);
eq('invoice total', invoice.totalMinor, 9750);
eq('invoice cogs', invoice.costTotalMinor, 1800);
eq('invoice line count', invoice.lines.length, 3);

// idempotent replay returns same invoice
const replay = await call('POST', `/visits/${visitId}/checkout`, {
  body: { adjustmentMinor: -500, adjustmentNote: 'خصم اختبار' },
  headers: { 'Idempotency-Key': checkoutKey },
});
eq('replay status', replay.status, 201);
eq('replay flag', replay.data.meta.replayed, true);
eq('replay same invoice', replay.data.data.invoice.id, invoice.id);

// visit closed, stock deducted, devices free
const closedVisit = await call('GET', `/visits/${visitId}`);
eq('visit closed', closedVisit.data.data.visit.status, 'closed');
eq('visit invoice linked', closedVisit.data.data.visit.invoiceId, invoice.id);
eq('session ended by checkout', closedVisit.data.data.visit.activeSession, null);

const afterSale = await call('GET', `/products/${productId}`);
eq('stock deducted at checkout', afterSale.data.data.product.stockQty, 13);
eq('reservation released', afterSale.data.data.product.reservedQty, 0);

const deviceAFree = await call('GET', `/devices/${deviceAId}`);
eq('device A free', deviceAFree.data.data.device.status, 'available');
const deviceBFree = await call('GET', `/devices/${deviceBId}`);
eq('device B free', deviceBFree.data.data.device.status, 'available');

const salesMovements = await call('GET', `/inventory/movements?productId=${productId}&type=sale`);
eq('sale movements recorded', salesMovements.data.data.movements.length, 1);
eq('sale movement qty', salesMovements.data.data.movements[0].qtyDelta, -2);

const invoiceByVisit = await call('GET', `/invoices/by-visit/${visitId}`);
eq('invoice by visit', invoiceByVisit.data.data.invoice.id, invoice.id);

// ── 9. records / summary reflect the checkout ─────────────────────────────
const summaryAfter = await call('GET', '/reports/summary?period=all');
eq(
  'revenue delta',
  summaryAfter.data.data.revenue.revenueMinor - baseRevenue,
  invoice.totalMinor,
);
eq(
  'invoice count delta',
  summaryAfter.data.data.revenue.invoiceCount - baseInvoices,
  1,
);

const records = await call('GET', '/reports/records?period=all');
const recordKinds = (records.data.data.items || []).map((item) => item.kind);
check('records include checkout', recordKinds.includes('checkout'));
check('records include session start', recordKinds.includes('session_started'));

const csvRecords = await call('GET', '/reports/records?period=all&export=csv', { raw: true });
eq('records csv status', csvRecords.status, 200);
check('records csv has header', csvRecords.text.includes('النوع') || csvRecords.text.includes('type'));

// ── 10. hard delete invoice restores stock and removes movements ──────────
const wrongDelete = await call('DELETE', `/invoices/${invoice.id}`, {
  body: { confirmInvoiceNumber: 'WRONG' },
});
eq('wrong invoice confirmation rejected', wrongDelete.status, 422);
eq('confirmation error code', wrongDelete.data?.error?.code, 'INVOICE_CONFIRMATION_MISMATCH');

const deleted = await call('DELETE', `/invoices/${invoice.id}`, {
  body: { confirmInvoiceNumber: invoice.invoiceNumber },
});
eq('hard delete status', deleted.status, 204);

const invoiceGone = await call('GET', `/invoices/${invoice.id}`);
eq('invoice gone', invoiceGone.status, 404);
const visitGone = await call('GET', `/visits/${visitId}`);
eq('visit gone', visitGone.status, 404);

const stockRestored = await call('GET', `/products/${productId}`);
eq('stock restored after delete', stockRestored.data.data.product.stockQty, 15);

const salesAfterDelete = await call('GET', `/inventory/movements?productId=${productId}&type=sale`);
eq('sale movements removed', salesAfterDelete.data.data.movements.length, 0);

const summaryRestored = await call('GET', '/reports/summary?period=all');
eq('revenue back to baseline', summaryRestored.data.data.revenue.revenueMinor, baseRevenue);
eq('invoice count back to baseline', summaryRestored.data.data.revenue.invoiceCount, baseInvoices);

// ── 11. quick sale ─────────────────────────────────────────────────────────
const quick = await call('POST', '/sales', {
  body: { items: [{ productId, qty: 3 }], playerName: `${run}-walkin`, notes: 'بيع مباشر' },
  headers: { 'Idempotency-Key': idem() },
});
eq('quick sale status', quick.status, 201);
eq('quick sale total', quick.data.data.invoice.totalMinor, 4500);
eq('quick sale type', quick.data.data.invoice.type, 'quick_sale');

const stockAfterQuick = await call('GET', `/products/${productId}`);
eq('quick sale deducted stock immediately', stockAfterQuick.data.data.product.stockQty, 12);

const quickList = await call('GET', '/sales');
check(
  'quick sale appears in sales list',
  (quickList.data.data.invoices || []).some((row) => row.id === quick.data.data.invoice.id),
);

// ── 12. expenses ──────────────────────────────────────────────────────────
const expenseCategory = await call('POST', '/expense-categories', {
  body: { name: `${run}-internet` },
});
eq('create expense category', expenseCategory.status, 201);
const expenseCategoryId = expenseCategory.data.data.category.id;

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const expense = await call('POST', '/expenses', {
  body: {
    title: `${run}-bill`,
    amountMinor: 2000,
    categoryId: expenseCategoryId,
    expenseDate: today,
    note: 'اختبار',
  },
});
eq('create expense', expense.status, 201);
const expenseId = expense.data.data.expense.id;

const summaryExpense = await call('GET', '/reports/summary?period=day');
const expenseRow = (summaryExpense.data.data.expenses.byCategory || []).find(
  (row) => row.category === `${run}-internet`,
);
check('expense included in summary by category', Boolean(expenseRow), JSON.stringify(expenseRow));

// ── 13. low stock alerts + dashboard ─────────────────────────────────────
const lowProduct = await call('POST', '/products', {
  body: {
    name: `${run}-low`,
    sku: `${run}-LOW`,
    categoryId,
    sellingPriceMinor: 500,
    purchasePriceMinor: 200,
    stockQty: 1,
    minStockQty: 5,
  },
});
eq('create low-stock product', lowProduct.status, 201);
const lowProductId = lowProduct.data.data.product.id;

const lowList = await call('GET', '/products/low-stock');
check(
  'low stock endpoint includes product',
  (lowList.data.data.products || []).some((row) => row.id === lowProductId),
);

const dashboard = await call('GET', '/dashboard');
eq('dashboard device total grew', dashboard.data.data.devices.total, baseDevices + 2);
check(
  'dashboard low stock includes product',
  (dashboard.data.data.lowStock || []).some((row) => row.id === lowProductId),
);
check('dashboard today has revenue', dashboard.data.data.today.revenueMinor >= 4500);
check(
  'dashboard open visits excludes closed visit',
  !(dashboard.data.data.openVisits || []).some((row) => row.id === visitId),
);

// ── 14. reports: devices / products / inventory / revenue daily + CSV ────
const devicesReport = await call(
  'GET',
  `/reports/devices?from=${today}&to=${today}`,
);
eq('devices report', devicesReport.status, 200);
check('devices report rows', Array.isArray(devicesReport.data.data.devices));

const productsReport = await call(
  'GET',
  `/reports/products?from=${today}&to=${today}`,
);
eq('products report', productsReport.status, 200);
check(
  'products report includes sold product',
  (productsReport.data.data.products || []).some((row) => row.productId === productId),
);

const inventoryReport = await call('GET', '/reports/inventory');
eq('inventory report', inventoryReport.status, 200);

const revenueDaily = await call('GET', `/reports/revenue/daily?from=${today}&to=${today}`);
eq('revenue daily', revenueDaily.status, 200);

const csvInventory = await call('GET', '/reports/inventory?export=csv', { raw: true });
eq('inventory csv status', csvInventory.status, 200);

// cleanup: delete created data where endpoints allow
const cleanupExpense = await call('DELETE', `/expenses/${expenseId}`, { body: { confirm: true } });
eq('delete expense', cleanupExpense.status, 204);
const cleanupQuick = await call('DELETE', `/invoices/${quick.data.data.invoice.id}`, {
  body: { confirmInvoiceNumber: quick.data.data.invoice.invoiceNumber },
});
eq('delete quick sale invoice', cleanupQuick.status, 204);
const cleanupProduct = await call('DELETE', `/products/${productId}`);
eq('delete product', cleanupProduct.status, 204);
const cleanupLow = await call('DELETE', `/products/${lowProductId}`);
eq('delete low product', cleanupLow.status, 204);
const cleanupDeviceA = await call('DELETE', `/devices/${deviceAId}`);
eq('delete device A', cleanupDeviceA.status, 204);
const cleanupDeviceB = await call('DELETE', `/devices/${deviceBId}`);
eq('delete device B', cleanupDeviceB.status, 204);

// ── summary ───────────────────────────────────────────────────────────────
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('Failures:');
  for (const item of failed) console.log(` - ${item.label}`);
}

await mongoose.disconnect();
process.exit(failed.length === 0 ? 0 : 1);
