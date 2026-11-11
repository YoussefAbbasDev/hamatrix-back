import mongoose from 'mongoose';
import { DEVICE_STATUS, PAYMENT_METHOD, SESSION_STATUS, STOCK_MOVEMENT_TYPE, VISIT_STATUS, VISIT_TYPE } from '../../utils/enums.js';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { Visit } from './model.js';
import { Session } from '../sessions/model.js';
import { Product } from '../products/model.js';
import { Invoice } from '../invoices/model.js';
import { presentSession } from '../sessions/presenter.js';
import { presentInvoice } from '../invoices/presenter.js';
import { endSessionDoc } from '../sessions/lifecycle.js';
import { recordMovement } from '../inventory/service.js';
import { getSettings } from '../settings/service.js';
import { emitEvent, SOCKET_EVENTS } from '../../sockets/events.js';
import { errors } from '../../utils/errors.js';
import { withTransaction } from '../../utils/txn.js';
import { nextSequence, formatDocumentNumber, monthPeriod } from '../../utils/ids.js';
import { resolveSort, paginationMeta } from '../../utils/validation.js';
import { businessDayRange, DEFAULT_TIMEZONE } from '../../utils/time.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── numbering ────────────────────────────────────────────────────────────────

export async function createVisitDoc({
  playerName = '',
  notes = '',
  type = VISIT_TYPE.SESSION,
  dbSession,
  at = new Date(),
}) {
  const period = monthPeriod(at);
  const seq = await nextSequence('visit', { session: dbSession, period });
  const [visit] = await Visit.create(
    [
      {
        visitNumber: formatDocumentNumber('VST', period, seq),
        type,
        playerName,
        notes,
        status: VISIT_STATUS.OPEN,
        openedAt: at,
        items: [],
        sessions: [],
      },
    ],
    { session: dbSession },
  );
  return visit;
}

// ── read model ───────────────────────────────────────────────────────────────

export function presentVisit(visit, sessions = [], at = new Date()) {
  const views = sessions
    .map((session) => presentSession(session, at))
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  const items = (visit.items ?? []).map((item) => ({
    id: String(item._id),
    productId: item.product ? String(item.product) : null,
    name: item.nameSnapshot,
    sku: item.skuSnapshot,
    qty: item.qty,
    unitPriceMinor: item.unitPriceMinor,
    purchasePriceMinor: item.purchasePriceMinor,
    lineTotalMinor: item.lineTotalMinor,
    addedAt: item.addedAt,
  }));

  const itemsSubtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const timeSubtotalMinor = views.reduce((sum, session) => sum + session.timeChargeMinor, 0);
  const computedTotalMinor = itemsSubtotalMinor + timeSubtotalMinor;
  const adjustmentMinor = visit.adjustmentMinor ?? 0;
  const totalMinor = Math.max(0, computedTotalMinor + adjustmentMinor);

  return {
    id: String(visit._id),
    visitNumber: visit.visitNumber,
    type: visit.type,
    playerName: visit.playerName ?? '',
    status: visit.status,
    openedAt: visit.openedAt,
    closedAt: visit.closedAt ?? null,
    notes: visit.notes ?? '',
    items,
    itemsCount: items.reduce((sum, item) => sum + item.qty, 0),
    sessions: views,
    activeSession: views.find((session) => session.status !== SESSION_STATUS.ENDED) ?? null,
    totals: {
      itemsSubtotalMinor,
      timeSubtotalMinor,
      computedTotalMinor,
      adjustmentMinor,
      adjustmentNote: visit.adjustmentNote ?? '',
      totalMinor,
    },
    invoiceId: visit.invoice ? String(visit.invoice) : null,
  };
}

export async function getVisitDetail(visitId) {
  const visit = await Visit.findById(visitId).lean();
  if (!visit) throw errors.notFound('الزيارة');

  const sessions = await Session.find({ _id: { $in: visit.sessions ?? [] } })
    .sort({ startedAt: 1 })
    .lean();

  return { visit: presentVisit(visit, sessions) };
}

export async function listVisits(query) {
  const { page, limit, sort, status, type, from, to, q } = query;

  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (from || to) {
    filter.openedAt = {};
    if (from) filter.openedAt.$gte = businessDayRange(from, DEFAULT_TIMEZONE).start;
    if (to) filter.openedAt.$lt = businessDayRange(to, DEFAULT_TIMEZONE).end;
  }
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ playerName: regex }, { visitNumber: regex }];
  }

  const sortObject = resolveSort(sort, ['openedAt', 'closedAt', 'visitNumber'], '-openedAt');
  const [visits, total] = await Promise.all([
    Visit.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Visit.countDocuments(filter),
  ]);

  const sessionIds = visits.flatMap((visit) => visit.sessions ?? []);
  const sessions = sessionIds.length
    ? await Session.find({ _id: { $in: sessionIds } }).lean()
    : [];
  const byVisit = new Map();
  for (const session of sessions) {
    const key = String(session.visit);
    if (!byVisit.has(key)) byVisit.set(key, []);
    byVisit.get(key).push(session);
  }

  return {
    visits: visits.map((visit) => presentVisit(visit, byVisit.get(String(visit._id)) ?? [])),
    pagination: paginationMeta(total, page, limit),
  };
}

// ── visit editing ────────────────────────────────────────────────────────────

export async function createVisit({ playerName = '', notes = '' }) {
  return withTransaction(async (dbSession) => {
    const visit = await createVisitDoc({ playerName, notes, dbSession });
    return { visit: presentVisit(visit.toObject(), []) };
  });
}

export async function updateVisit(visitId, patch) {
  const visit = await Visit.findById(visitId);
  if (!visit) throw errors.notFound('الزيارة');
  if (visit.status !== VISIT_STATUS.OPEN) {
    throw errors.conflict(ERROR_CODES.VISIT_ALREADY_CLOSED, 'الزيارة مغلقة بالفعل');
  }

  if (patch.playerName !== undefined) visit.playerName = patch.playerName;
  if (patch.notes !== undefined) visit.notes = patch.notes;
  await visit.save();

  return getVisitDetail(visit._id);
}

export async function abandonVisit(visitId) {
  const visit = await Visit.findById(visitId);
  if (!visit) throw errors.notFound('الزيارة');
  if (visit.status !== VISIT_STATUS.OPEN) {
    throw errors.conflict(ERROR_CODES.VISIT_ALREADY_CLOSED, 'الزيارة مغلقة بالفعل');
  }
  if ((visit.sessions ?? []).length > 0) {
    throw errors.conflict(
      ERROR_CODES.CONFLICT_STATE,
      'لا يمكن إلغاء زيارة لها جلسات. أنهاها ثم احذف الفاتورة إن لزم.',
    );
  }

  await Visit.deleteOne({ _id: visit._id });
  return { id: String(visit._id) };
}

// ── items ────────────────────────────────────────────────────────────────────

/**
 * BR-57/BR-58: how many units of this product the visit may hold in total,
 * ignoring the visit being edited (its own reservation is not "another" one).
 */
async function availableForVisit({ product, visitId, dbSession }) {
  const rows = await Visit.aggregate([
    { $match: { status: VISIT_STATUS.OPEN, _id: { $ne: new mongoose.Types.ObjectId(String(visitId)) } } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(String(product._id)) } },
    { $group: { _id: '$items.product', qty: { $sum: '$items.qty' } } },
  ]).session(dbSession);

  const reservedElsewhere = rows[0]?.qty ?? 0;
  return product.stockQty - reservedElsewhere;
}

async function findOpenVisit(visitId, dbSession) {
  const visit = await Visit.findById(visitId).session(dbSession);
  if (!visit) throw errors.notFound('الزيارة');
  if (visit.status !== VISIT_STATUS.OPEN) {
    throw errors.conflict(ERROR_CODES.VISIT_ALREADY_CLOSED, 'الزيارة مغلقة بالفعل');
  }
  return visit;
}

export async function addVisitItem(visitId, { productId, qty }, actorId) {
  const result = await withTransaction(async (dbSession) => {
    const visit = await findOpenVisit(visitId, dbSession);

    const product = await Product.findOne({ _id: productId, isDeleted: false }).session(dbSession);
    if (!product) throw errors.notFound('المنتج');
    if (!product.isActive) {
      throw errors.business(ERROR_CODES.PRODUCT_INACTIVE, `المنتج «${product.name}» غير مفعّل`);
    }

    const line = visit.items.find((item) => String(item.product) === String(product._id));
    const currentQty = line?.qty ?? 0;
    const limit = await availableForVisit({ product, visitId: visit._id, dbSession });

    if (currentQty + qty > limit) {
      throw errors.business(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `المتاح من «${product.name}» هو ${Math.max(0, limit - currentQty)} فقط`,
        { productId: String(product._id), name: product.name, availableQty: Math.max(0, limit - currentQty) },
      );
    }

    const at = new Date();
    if (line) {
      line.qty += qty;
      line.lineTotalMinor = line.unitPriceMinor * line.qty;
    } else {
      visit.items.push({
        product: product._id,
        nameSnapshot: product.name,
        skuSnapshot: product.sku,
        qty,
        unitPriceMinor: product.sellingPriceMinor,
        purchasePriceMinor: product.purchasePriceMinor,
        lineTotalMinor: product.sellingPriceMinor * qty,
        addedAt: at,
        addedBy: actorId,
      });
    }

    await visit.save({ session: dbSession });
    return String(visit._id);
  });

  return getVisitDetail(result);
}

export async function updateVisitItem(visitId, itemId, { qty }, actorId) {
  const result = await withTransaction(async (dbSession) => {
    const visit = await findOpenVisit(visitId, dbSession);
    const line = visit.items.id(itemId);
    if (!line) throw errors.notFound('عنصر الفاتورة');

    const product = await Product.findOne({ _id: line.product, isDeleted: false }).session(dbSession);
    if (!product) throw errors.notFound('المنتج');

    const limit = await availableForVisit({ product, visitId: visit._id, dbSession });
    if (qty > limit) {
      throw errors.business(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `المتاح من «${product.name}» هو ${Math.max(0, limit)} فقط`,
        { productId: String(product._id), name: product.name, availableQty: Math.max(0, limit) },
      );
    }

    line.qty = qty;
    line.lineTotalMinor = line.unitPriceMinor * qty;
    await visit.save({ session: dbSession });

    return String(visit._id);
  });

  return getVisitDetail(result);
}

export async function removeVisitItem(visitId, itemId) {
  const result = await withTransaction(async (dbSession) => {
    const visit = await findOpenVisit(visitId, dbSession);
    const line = visit.items.id(itemId);
    if (!line) throw errors.notFound('عنصر الفاتورة');

    line.deleteOne();
    await visit.save({ session: dbSession });
    return String(visit._id);
  });

  return getVisitDetail(result);
}

// ── checkout ─────────────────────────────────────────────────────────────────

function buildInvoiceLines(visit, sessions) {
  const lines = [];

  for (const session of [...sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))) {
    const deviceName = session.deviceSnapshot?.name || 'جهاز';
    lines.push({
      kind: 'time',
      refId: session._id,
      description: `${deviceName} — ${session.billableMinutes} دقيقة`,
      qty: 1,
      unitPriceMinor: session.ratePerHourMinor,
      lineTotalMinor: session.timeChargeMinor,
      costMinor: 0,
      meta: {
        deviceName,
        deviceCode: session.deviceSnapshot?.code ?? '',
        minutes: session.billableMinutes,
        ratePerHourMinor: session.ratePerHourMinor,
        sessionId: session._id,
      },
    });
  }

  for (const item of visit.items) {
    lines.push({
      kind: 'product',
      refId: item._id,
      description: item.nameSnapshot,
      qty: item.qty,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
      costMinor: item.purchasePriceMinor * item.qty,
      meta: {
        productId: item.product,
        sku: item.skuSnapshot,
        qty: item.qty,
      },
    });
  }

  return lines;
}

async function performCheckout({
  visit,
  dbSession,
  actorId,
  adjustmentMinor = 0,
  adjustmentNote = '',
  settings,
  at = new Date(),
}) {
  const sessions = await Session.find({ _id: { $in: visit.sessions ?? [] } }).session(dbSession);

  const endedDeviceIds = [];
  for (const doc of sessions) {
    const outcome = await endSessionDoc(doc, { at, dbSession, reason: 'checkout' });
    if (!outcome.alreadyEnded) endedDeviceIds.push(outcome.deviceId);
  }

  const itemsSubtotalMinor = visit.items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const timeSubtotalMinor = sessions.reduce((sum, session) => sum + (session.timeChargeMinor ?? 0), 0);
  const computedTotalMinor = itemsSubtotalMinor + timeSubtotalMinor;

  if (visit.items.length === 0 && timeSubtotalMinor === 0) {
    throw errors.business(ERROR_CODES.VISIT_EMPTY, 'لا توجد مبالغ للتحصيل في هذه الزيارة');
  }

  const totalMinor = computedTotalMinor + adjustmentMinor;
  if (totalMinor < 0) {
    throw errors.business(
      ERROR_CODES.INVALID_ADJUSTMENT,
      'الإجمالي النهائي لا يمكن أن يكون سالبًا',
      { computedTotalMinor, adjustmentMinor },
    );
  }

  // BR-60/BR-61: deduct stock atomically, guarded per product.
  const quantities = new Map();
  for (const item of visit.items) {
    const key = String(item.product);
    const current = quantities.get(key);
    quantities.set(key, { qty: (current?.qty ?? 0) + item.qty, item });
  }

  const lowStock = [];
  for (const [productId, entry] of quantities) {
    const product = await Product.findOne({ _id: productId, isDeleted: false }).session(dbSession);
    if (!product) throw errors.notFound('المنتج');

    const qtyBefore = product.stockQty;
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, stockQty: { $gte: entry.qty } },
      { $inc: { stockQty: -entry.qty } },
      { new: false, session: dbSession },
    );

    if (!updated) {
      throw errors.business(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `الكمية المتاحة من «${product.name}» لا تكفي (المتاح ${qtyBefore})`,
        { productId, name: product.name, availableQty: qtyBefore, requestedQty: entry.qty },
      );
    }

    await recordMovement({
      product,
      type: STOCK_MOVEMENT_TYPE.SALE,
      qtyDelta: -entry.qty,
      qtyBefore,
      qtyAfter: qtyBefore - entry.qty,
      unitCostMinor: product.purchasePriceMinor,
      reference: { kind: 'visit', id: visit._id, number: visit.visitNumber },
      note: '',
      actorId,
      session: dbSession,
    });

    if (qtyBefore - entry.qty <= product.minStockQty) {
      lowStock.push({
        productId,
        name: product.name,
        stockQty: qtyBefore - entry.qty,
      });
    }
  }

  const period = monthPeriod(at);
  const seq = await nextSequence('invoice', { session: dbSession, period });
  const prefix = (settings.invoice?.prefix || 'INV').toUpperCase();
  const invoiceNumber = formatDocumentNumber(prefix, period, seq);

  const lines = buildInvoiceLines(visit, sessions);
  const costTotalMinor = visit.items.reduce(
    (sum, item) => sum + item.purchasePriceMinor * item.qty,
    0,
  );

  const [invoice] = await Invoice.create(
    [
      {
        invoiceNumber,
        visit: visit._id,
        type: visit.type,
        playerName: visit.playerName,
        lines,
        subtotalMinor: computedTotalMinor,
        adjustmentMinor,
        adjustmentNote,
        totalMinor,
        costTotalMinor,
        issuedAt: at,
        paidAt: at,
        paymentMethod: PAYMENT_METHOD.CASH,
        status: 'paid',
        currency: settings.locale?.currency ?? 'EGP',
        storeSnapshot: {
          name: settings.brand?.name ?? '',
          phone: settings.invoice?.storePhone ?? '',
          address: settings.invoice?.storeAddress ?? '',
        },
        visitType: visit.type,
        openedAt: visit.openedAt,
        closedAt: at,
      },
    ],
    { session: dbSession },
  );

  visit.status = VISIT_STATUS.CLOSED;
  visit.closedAt = at;
  visit.itemsSubtotalMinor = itemsSubtotalMinor;
  visit.timeSubtotalMinor = timeSubtotalMinor;
  visit.computedTotalMinor = computedTotalMinor;
  visit.adjustmentMinor = adjustmentMinor;
  visit.adjustmentNote = adjustmentNote;
  visit.totalMinor = totalMinor;
  visit.costTotalMinor = costTotalMinor;
  visit.invoice = invoice._id;
  await visit.save({ session: dbSession });

  return {
    invoice: presentInvoice(invoice.toObject()),
    visitId: String(visit._id),
    endedDeviceIds,
    lowStock,
  };
}

export async function checkoutVisit(visitId, { adjustmentMinor = 0, adjustmentNote = '' }, actorId) {
  const settings = await getSettings();

  const result = await withTransaction(async (dbSession) => {
    const visit = await Visit.findById(visitId).session(dbSession);
    if (!visit) throw errors.notFound('الزيارة');
    if (visit.status !== VISIT_STATUS.OPEN) {
      throw errors.conflict(ERROR_CODES.VISIT_ALREADY_CLOSED, 'الزيارة مغلقة بالفعل');
    }

    return performCheckout({
      visit,
      dbSession,
      actorId,
      adjustmentMinor,
      adjustmentNote,
      settings,
    });
  });

  emitCheckout(result);
  return result;
}

function emitCheckout(result) {
  emitEvent(SOCKET_EVENTS.VISIT_CLOSED, {
    visitId: result.visitId,
    invoiceId: result.invoice.id,
  });
  emitEvent(SOCKET_EVENTS.INVOICE_ISSUED, { invoiceId: result.invoice.id });
  for (const deviceId of result.endedDeviceIds ?? []) {
    emitEvent(SOCKET_EVENTS.DEVICE_STATUS, {
      deviceId,
      status: DEVICE_STATUS.AVAILABLE,
    });
  }
  for (const item of result.lowStock ?? []) {
    emitEvent(SOCKET_EVENTS.STOCK_LOW, item);
  }
}

// ── quick sale ───────────────────────────────────────────────────────────────

export async function quickSale({ items, playerName = '', notes = '' }, actorId) {
  const settings = await getSettings();
  const at = new Date();

  const result = await withTransaction(async (dbSession) => {
    const visit = await createVisitDoc({
      playerName,
      notes,
      type: VISIT_TYPE.QUICK_SALE,
      dbSession,
      at,
    });

    const aggregated = new Map();
    for (const line of items) {
      const key = String(line.productId);
      aggregated.set(key, (aggregated.get(key) ?? 0) + line.qty);
    }

    for (const [productId, qty] of aggregated) {
      const product = await Product.findOne({ _id: productId, isDeleted: false }).session(dbSession);
      if (!product) throw errors.notFound('المنتج');
      if (!product.isActive) {
        throw errors.business(ERROR_CODES.PRODUCT_INACTIVE, `المنتج «${product.name}» غير مفعّل`);
      }

      visit.items.push({
        product: product._id,
        nameSnapshot: product.name,
        skuSnapshot: product.sku,
        qty,
        unitPriceMinor: product.sellingPriceMinor,
        purchasePriceMinor: product.purchasePriceMinor,
        lineTotalMinor: product.sellingPriceMinor * qty,
        addedAt: at,
        addedBy: actorId,
      });
    }

    await visit.save({ session: dbSession });

    return performCheckout({
      visit,
      dbSession,
      actorId,
      adjustmentMinor: 0,
      adjustmentNote: '',
      settings,
      at,
    });
  });

  emitCheckout(result);
  return result;
}
