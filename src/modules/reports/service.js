import { INVOICE_TYPE, SESSION_STATUS, STOCK_MOVEMENT_TYPE, VISIT_STATUS } from '../../utils/enums.js';
import { Device } from '../devices/model.js';
import { Session } from '../sessions/model.js';
import { Visit } from '../visits/model.js';
import { Invoice } from '../invoices/model.js';
import { Product } from '../products/model.js';
import { StockMovement } from '../inventory/movement.model.js';
import { Expense } from '../expenses/model.js';
import { presentVisit } from '../visits/service.js';
import { presentInvoice } from '../invoices/presenter.js';
import { listActiveSessions } from '../sessions/service.js';
import { lowStockProducts } from '../products/service.js';
import { inventoryValuation } from '../inventory/service.js';
import { errors } from '../../utils/errors.js';
import { businessDayRange, DEFAULT_TIMEZONE, dayjs } from '../../utils/time.js';

const TZ = DEFAULT_TIMEZONE;
const EPOCH_DAY = '2000-01-01';

const emptyInvoiceTotals = {
  count: 0,
  revenueMinor: 0,
  subtotalMinor: 0,
  adjustmentMinor: 0,
  cogsMinor: 0,
  gamingMinor: 0,
  cafeteriaMinor: 0,
  gamingMinutes: 0,
  productLines: 0,
};

function presentRange(range) {
  return {
    fromDate: range.fromDate,
    toDate: range.toDate,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    period: range.period,
    days: range.days,
  };
}

/**
 * Resolves `period` / `from` / `to` / `date` into a half-open UTC range whose
 * boundaries fall on Cairo business days. The business day ends at 00:00
 * Cairo, matching the rest of the system (BR-04).
 */
export function resolveReportRange(input = {}, { defaultPeriod = 'day' } = {}) {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');
  let fromDate;
  let toDate;
  let period = input.period;

  if (input.date) {
    fromDate = input.date;
    toDate = input.date;
    period = 'day';
  } else if (input.from || input.to) {
    fromDate = input.from ?? input.to;
    toDate = input.to ?? input.from;
    period = period ?? 'custom';
  } else {
    period = period ?? defaultPeriod;
    if (period === 'month') {
      fromDate = dayjs().tz(TZ).startOf('month').format('YYYY-MM-DD');
      toDate = today;
    } else if (period === 'all') {
      fromDate = EPOCH_DAY;
      toDate = today;
    } else {
      fromDate = today;
      toDate = today;
    }
  }

  if (fromDate > toDate) {
    throw errors.validation([
      { path: 'from', message: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية' },
    ]);
  }

  const startRange = businessDayRange(fromDate, TZ);
  const endRange = businessDayRange(toDate, TZ);
  const days = Math.max(
    1,
    Math.round((endRange.start.getTime() - startRange.start.getTime()) / 86_400_000) + 1,
  );

  return {
    period,
    fromDate,
    toDate,
    from: startRange.start,
    to: endRange.end,
    days,
  };
}

// ── shared aggregations ──────────────────────────────────────────────────────

async function invoiceTotals(match) {
  const [row] = await Invoice.aggregate([
    { $match: match },
    {
      $project: {
        totalMinor: 1,
        subtotalMinor: 1,
        adjustmentMinor: 1,
        costTotalMinor: 1,
        gamingMinor: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$lines', []] },
                  as: 'line',
                  cond: { $eq: ['$$line.kind', 'time'] },
                },
              },
              as: 'line',
              in: '$$line.lineTotalMinor',
            },
          },
        },
        cafeteriaMinor: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$lines', []] },
                  as: 'line',
                  cond: { $eq: ['$$line.kind', 'product'] },
                },
              },
              as: 'line',
              in: '$$line.lineTotalMinor',
            },
          },
        },
        gamingMinutes: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$lines', []] },
                  as: 'line',
                  cond: { $eq: ['$$line.kind', 'time'] },
                },
              },
              as: 'line',
              in: { $ifNull: ['$$line.meta.minutes', 0] },
            },
          },
        },
        productLines: {
          $size: {
            $filter: {
              input: { $ifNull: ['$lines', []] },
              as: 'line',
              cond: { $eq: ['$$line.kind', 'product'] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        revenueMinor: { $sum: '$totalMinor' },
        subtotalMinor: { $sum: '$subtotalMinor' },
        adjustmentMinor: { $sum: '$adjustmentMinor' },
        cogsMinor: { $sum: '$costTotalMinor' },
        gamingMinor: { $sum: '$gamingMinor' },
        cafeteriaMinor: { $sum: '$cafeteriaMinor' },
        gamingMinutes: { $sum: '$gamingMinutes' },
        productLines: { $sum: '$productLines' },
      },
    },
  ]);

  if (!row) return { ...emptyInvoiceTotals };
  const { _id, ...rest } = row;
  return rest;
}

async function expensesTotal(match) {
  const [row] = await Expense.aggregate([
    { $match: match },
    { $group: { _id: null, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
  ]);
  return { totalMinor: row?.totalMinor ?? 0, count: row?.count ?? 0 };
}

// ── dashboard ────────────────────────────────────────────────────────────────

export async function dashboard() {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');
  const range = businessDayRange(today, TZ);

  const [deviceRows, activeResult, openDocs, inv, exp, lowStock, recentDocs] = await Promise.all([
    Device.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    listActiveSessions({ page: 1, limit: 100 }),
    Visit.find({ status: VISIT_STATUS.OPEN }).sort({ openedAt: 1 }).limit(50).lean(),
    invoiceTotals({ issuedAt: { $gte: range.start, $lt: range.end } }),
    expensesTotal({ expenseDate: { $gte: range.start, $lt: range.end } }),
    lowStockProducts(),
    Invoice.find().sort({ issuedAt: -1 }).limit(8).lean(),
  ]);

  const counts = { available: 0, occupied: 0, maintenance: 0 };
  for (const row of deviceRows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  const totalDevices = deviceRows.reduce((sum, row) => sum + row.count, 0);

  const sessionIds = openDocs.flatMap((visit) => visit.sessions ?? []);
  const sessionDocs = sessionIds.length
    ? await Session.find({ _id: { $in: sessionIds } }).lean()
    : [];
  const byVisit = new Map();
  for (const session of sessionDocs) {
    const key = String(session.visit);
    if (!byVisit.has(key)) byVisit.set(key, []);
    byVisit.get(key).push(session);
  }
  const openVisits = openDocs.map((visit) =>
    presentVisit(visit, byVisit.get(String(visit._id)) ?? []),
  );

  return {
    devices: {
      total: totalDevices,
      ...counts,
    },
    activeSessions: activeResult.sessions,
    openVisits,
    today: {
      date: today,
      revenueMinor: inv.revenueMinor,
      gamingMinor: inv.gamingMinor,
      cafeteriaMinor: inv.cafeteriaMinor,
      expensesMinor: exp.totalMinor,
      cogsMinor: inv.cogsMinor,
      netMinor: inv.revenueMinor - inv.cogsMinor - exp.totalMinor,
      invoiceCount: inv.count,
    },
    lowStock,
    recent: recentDocs.map(presentInvoice),
    serverTime: new Date().toISOString(),
  };
}

export async function dashboardCharts({ days = 14 } = {}) {
  const startDay = dayjs().tz(TZ).startOf('day').subtract(days - 1, 'day');
  const start = startDay.toDate();
  const end = dayjs().tz(TZ).startOf('day').add(1, 'day').toDate();
  const match = { issuedAt: { $gte: start, $lt: end } };

  const [revenueRows, sessionRows, hourRows, devices] = await Promise.all([
    Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt', timezone: TZ } },
          revenueMinor: { $sum: '$totalMinor' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Session.aggregate([
      {
        $match: {
          status: SESSION_STATUS.ENDED,
          endedAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: '$device',
          activeSeconds: { $sum: '$activeSeconds' },
          revenueMinor: { $sum: '$timeChargeMinor' },
          sessions: { $sum: 1 },
          name: { $first: '$deviceSnapshot.name' },
          code: { $first: '$deviceSnapshot.code' },
        },
      },
      { $sort: { activeSeconds: -1 } },
    ]),
    Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $hour: { date: '$issuedAt', timezone: TZ } },
          revenueMinor: { $sum: '$totalMinor' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Device.find({ isDeleted: false }).select('name code status').lean(),
  ]);

  const revenueByDay = new Map(revenueRows.map((row) => [row._id, row]));
  const revenueSeries = [];
  for (let index = 0; index < days; index += 1) {
    const date = startDay.add(index, 'day').format('YYYY-MM-DD');
    const row = revenueByDay.get(date);
    revenueSeries.push({
      date,
      revenueMinor: row?.revenueMinor ?? 0,
      invoiceCount: row?.count ?? 0,
    });
  }

  const sessionByDevice = new Map(sessionRows.map((row) => [String(row._id), row]));
  const windowSeconds = Math.max(1, days * 86_400);
  const deviceUtilization = devices
    .map((device) => {
      const row = sessionByDevice.get(String(device._id));
      const activeSeconds = row?.activeSeconds ?? 0;
      return {
        deviceId: String(device._id),
        name: device.name,
        code: device.code,
        status: device.status,
        sessions: row?.sessions ?? 0,
        activeSeconds,
        revenueMinor: row?.revenueMinor ?? 0,
        utilizationPercent: Number(((activeSeconds / windowSeconds) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.activeSeconds - a.activeSeconds);

  const hourByIndex = new Map(hourRows.map((row) => [row._id, row]));
  const hourlyHeat = Array.from({ length: 24 }, (_, hour) => {
    const row = hourByIndex.get(hour);
    return {
      hour,
      revenueMinor: row?.revenueMinor ?? 0,
      invoiceCount: row?.count ?? 0,
    };
  });

  return {
    range: { from: start.toISOString(), to: end.toISOString(), days },
    revenueSeries,
    deviceUtilization,
    hourlyHeat,
  };
}

// ── reports ──────────────────────────────────────────────────────────────────

export async function summary(query = {}) {
  const range = resolveReportRange(query, { defaultPeriod: 'month' });
  const match = { issuedAt: { $gte: range.from, $lt: range.to } };

  const [inv, exp, expenseCategories] = await Promise.all([
    invoiceTotals(match),
    expensesTotal({ expenseDate: { $gte: range.from, $lt: range.to } }),
    Expense.aggregate([
      { $match: { expenseDate: { $gte: range.from, $lt: range.to } } },
      {
        $group: {
          _id: '$categoryNameSnapshot',
          amountMinor: { $sum: '$amountMinor' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amountMinor: -1 } },
    ]),
  ]);

  return {
    range: presentRange(range),
    revenue: {
      invoiceCount: inv.count,
      revenueMinor: inv.revenueMinor,
      subtotalMinor: inv.subtotalMinor,
      adjustmentMinor: inv.adjustmentMinor,
      gamingMinor: inv.gamingMinor,
      cafeteriaMinor: inv.cafeteriaMinor,
      gamingMinutes: inv.gamingMinutes,
      averageInvoiceMinor: inv.count ? Math.round(inv.revenueMinor / inv.count) : 0,
    },
    costs: { cogsMinor: inv.cogsMinor },
    expenses: {
      totalMinor: exp.totalMinor,
      count: exp.count,
      byCategory: expenseCategories.map((row) => ({
        category: row._id || 'أخرى',
        amountMinor: row.amountMinor,
        count: row.count,
      })),
    },
    cashMinor: inv.revenueMinor,
    netMinor: inv.revenueMinor - inv.cogsMinor - exp.totalMinor,
  };
}

const MOVEMENT_KIND = {
  [STOCK_MOVEMENT_TYPE.PURCHASE]: 'stock_in',
  [STOCK_MOVEMENT_TYPE.INITIAL]: 'stock_in',
  [STOCK_MOVEMENT_TYPE.ADJUSTMENT]: 'adjustment',
  [STOCK_MOVEMENT_TYPE.DAMAGE]: 'adjustment',
  [STOCK_MOVEMENT_TYPE.WASTE]: 'adjustment',
};

const MOVEMENT_LABEL = {
  [STOCK_MOVEMENT_TYPE.PURCHASE]: 'توريد مخزون',
  [STOCK_MOVEMENT_TYPE.INITIAL]: 'رصيد افتتاحي',
  [STOCK_MOVEMENT_TYPE.ADJUSTMENT]: 'تسوية مخزون',
  [STOCK_MOVEMENT_TYPE.DAMAGE]: 'تالف',
  [STOCK_MOVEMENT_TYPE.WASTE]: 'هالك',
};

export async function records(query = {}) {
  const range = resolveReportRange(query, { defaultPeriod: 'day' });
  const limit = query.limit ?? 500;
  const window = { $gte: range.from, $lt: range.to };

  const [sessionDocs, movementDocs, invoiceDocs, expenseDocs] = await Promise.all([
    Session.find({
      $or: [{ startedAt: window }, { endedAt: window }],
    })
      .sort({ startedAt: -1 })
      .lean(),
    StockMovement.find({ createdAt: window }).sort({ createdAt: -1 }).lean(),
    Invoice.find({ issuedAt: window }).sort({ issuedAt: -1 }).lean(),
    Expense.find({ createdAt: window }).sort({ createdAt: -1 }).lean(),
  ]);

  const visitIds = [...new Set(sessionDocs.map((session) => String(session.visit)))];
  const visitDocs = visitIds.length
    ? await Visit.find({ _id: { $in: visitIds } })
        .select('visitNumber playerName')
        .lean()
    : [];
  const visitById = new Map(visitDocs.map((visit) => [String(visit._id), visit]));

  const items = [];

  for (const session of sessionDocs) {
    const deviceName = session.deviceSnapshot?.name || 'جهاز';
    const visit = visitById.get(String(session.visit));

    if (session.startedAt >= range.from && session.startedAt < range.to) {
      items.push({
        at: session.startedAt,
        kind: 'session_started',
        title: `بدء جلسة ${deviceName}`,
        playerName: visit?.playerName ?? '',
        amountMinor: null,
        ref: { type: 'session', id: String(session._id), number: session.sessionNumber },
        meta: {
          deviceName,
          deviceCode: session.deviceSnapshot?.code ?? '',
          billingMode: session.billingMode,
          visitNumber: visit?.visitNumber ?? null,
        },
      });
    }

    if (
      session.status === SESSION_STATUS.ENDED &&
      session.endedAt &&
      session.endedAt >= range.from &&
      session.endedAt < range.to
    ) {
      items.push({
        at: session.endedAt,
        kind: 'session_ended',
        title: `إنهاء جلسة ${deviceName}`,
        playerName: visit?.playerName ?? '',
        amountMinor: session.timeChargeMinor ?? 0,
        ref: { type: 'session', id: String(session._id), number: session.sessionNumber },
        meta: {
          deviceName,
          minutes: session.billableMinutes ?? 0,
          activeSeconds: session.activeSeconds ?? 0,
        },
      });
    }
  }

  for (const invoice of invoiceDocs) {
    const isQuickSale = invoice.type === INVOICE_TYPE.QUICK_SALE;
    const productLines = (invoice.lines ?? []).filter((line) => line.kind === 'product');
    const gamingMinutes = (invoice.lines ?? [])
      .filter((line) => line.kind === 'time')
      .reduce((sum, line) => sum + (line.meta?.minutes ?? 0), 0);

    items.push({
      at: invoice.issuedAt,
      kind: isQuickSale ? 'quick_sale' : 'checkout',
      title: isQuickSale
        ? `بيع سريع ${invoice.invoiceNumber}`
        : `تحصيل ${invoice.invoiceNumber}`,
      playerName: invoice.playerName ?? '',
      amountMinor: invoice.totalMinor,
      ref: { type: 'invoice', id: String(invoice._id), number: invoice.invoiceNumber },
      meta: {
        items: productLines.reduce((sum, line) => sum + (line.qty ?? 0), 0),
        gamingMinutes,
        cogsMinor: invoice.costTotalMinor ?? 0,
      },
    });
  }

  for (const movement of movementDocs) {
    const kind = MOVEMENT_KIND[movement.type] ?? 'adjustment';
    const label = MOVEMENT_LABEL[movement.type] ?? 'حركة مخزون';
    items.push({
      at: movement.createdAt,
      kind,
      title: `${label} — ${movement.productSnapshot?.name ?? ''}`,
      playerName: '',
      amountMinor: movement.valueDeltaMinor,
      ref: { type: 'movement', id: String(movement._id), number: null },
      meta: {
        movementType: movement.type,
        qtyDelta: movement.qtyDelta,
        qtyBefore: movement.qtyBefore,
        qtyAfter: movement.qtyAfter,
        supplierName: movement.supplierName ?? '',
        unitCostMinor: movement.unitCostMinor,
      },
    });
  }

  for (const expense of expenseDocs) {
    items.push({
      at: expense.createdAt,
      kind: 'expense',
      title: `مصروف: ${expense.title}`,
      playerName: '',
      amountMinor: expense.amountMinor,
      ref: { type: 'expense', id: String(expense._id), number: null },
      meta: { category: expense.categoryNameSnapshot ?? '', note: expense.note ?? '' },
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const inv = await invoiceTotals({ issuedAt: window });
  const exp = await expensesTotal({ expenseDate: window });
  const stockInValueMinor = movementDocs
    .filter((movement) => MOVEMENT_KIND[movement.type] === 'stock_in')
    .reduce((sum, movement) => sum + Math.max(0, movement.valueDeltaMinor), 0);

  return {
    range: presentRange(range),
    date: range.fromDate === range.toDate ? range.fromDate : null,
    items: items.slice(0, limit),
    count: items.length,
    truncated: items.length > limit,
    totals: {
      invoiceCount: inv.count,
      revenueMinor: inv.revenueMinor,
      gamingMinor: inv.gamingMinor,
      cafeteriaMinor: inv.cafeteriaMinor,
      cogsMinor: inv.cogsMinor,
      expensesMinor: exp.totalMinor,
      stockInValueMinor,
      netMinor: inv.revenueMinor - inv.cogsMinor - exp.totalMinor,
    },
  };
}

export async function revenueDaily(query = {}) {
  const range = resolveReportRange(query, { defaultPeriod: 'month' });
  if (!query.from && !query.to && !query.period) {
    range.fromDate = dayjs().tz(TZ).subtract(13, 'day').format('YYYY-MM-DD');
    range.from = businessDayRange(range.fromDate, TZ).start;
    range.days = Math.max(
      1,
      Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000),
    );
  }

  const rows = await Invoice.aggregate([
    { $match: { issuedAt: { $gte: range.from, $lt: range.to } } },
    {
      $project: {
        day: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt', timezone: TZ } },
        totalMinor: 1,
        costTotalMinor: 1,
        gamingMinor: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$lines', []] },
                  as: 'line',
                  cond: { $eq: ['$$line.kind', 'time'] },
                },
              },
              as: 'line',
              in: '$$line.lineTotalMinor',
            },
          },
        },
        cafeteriaMinor: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$lines', []] },
                  as: 'line',
                  cond: { $eq: ['$$line.kind', 'product'] },
                },
              },
              as: 'line',
              in: '$$line.lineTotalMinor',
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$day',
        invoiceCount: { $sum: 1 },
        revenueMinor: { $sum: '$totalMinor' },
        gamingMinor: { $sum: '$gamingMinor' },
        cafeteriaMinor: { $sum: '$cafeteriaMinor' },
        cogsMinor: { $sum: '$costTotalMinor' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const startDay = dayjs.tz(range.fromDate, TZ).startOf('day');
  const series = [];
  for (let index = 0; index < range.days; index += 1) {
    const date = startDay.add(index, 'day').format('YYYY-MM-DD');
    const row = byDay.get(date);
    series.push({
      date,
      invoiceCount: row?.invoiceCount ?? 0,
      revenueMinor: row?.revenueMinor ?? 0,
      gamingMinor: row?.gamingMinor ?? 0,
      cafeteriaMinor: row?.cafeteriaMinor ?? 0,
      cogsMinor: row?.cogsMinor ?? 0,
      netMinor: (row?.revenueMinor ?? 0) - (row?.cogsMinor ?? 0),
    });
  }

  return {
    range: presentRange(range),
    series,
    totals: {
      invoiceCount: series.reduce((sum, row) => sum + row.invoiceCount, 0),
      revenueMinor: series.reduce((sum, row) => sum + row.revenueMinor, 0),
      gamingMinor: series.reduce((sum, row) => sum + row.gamingMinor, 0),
      cafeteriaMinor: series.reduce((sum, row) => sum + row.cafeteriaMinor, 0),
      cogsMinor: series.reduce((sum, row) => sum + row.cogsMinor, 0),
      netMinor: series.reduce((sum, row) => sum + row.netMinor, 0),
    },
  };
}

export async function devicesReport(query = {}) {
  const range = resolveReportRange(query, { defaultPeriod: 'month' });

  const [devices, sessionRows] = await Promise.all([
    Device.find({ isDeleted: false }).select('name code status type').lean(),
    Session.aggregate([
      {
        $match: {
          status: SESSION_STATUS.ENDED,
          endedAt: { $gte: range.from, $lt: range.to },
        },
      },
      {
        $group: {
          _id: '$device',
          sessions: { $sum: 1 },
          activeSeconds: { $sum: '$activeSeconds' },
          revenueMinor: { $sum: '$timeChargeMinor' },
        },
      },
    ]),
  ]);

  const byDevice = new Map(sessionRows.map((row) => [String(row._id), row]));
  const windowSeconds = Math.max(1, range.days * 86_400);

  const rows = devices
    .map((device) => {
      const row = byDevice.get(String(device._id));
      const activeSeconds = row?.activeSeconds ?? 0;
      return {
        deviceId: String(device._id),
        name: device.name,
        code: device.code,
        type: device.type,
        status: device.status,
        sessions: row?.sessions ?? 0,
        activeSeconds,
        activeHours: Number((activeSeconds / 3600).toFixed(2)),
        revenueMinor: row?.revenueMinor ?? 0,
        utilizationPercent: Number(((activeSeconds / windowSeconds) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor);

  const totals = rows.reduce(
    (sum, row) => ({
      sessions: sum.sessions + row.sessions,
      activeSeconds: sum.activeSeconds + row.activeSeconds,
      revenueMinor: sum.revenueMinor + row.revenueMinor,
    }),
    { sessions: 0, activeSeconds: 0, revenueMinor: 0 },
  );

  return {
    range: presentRange(range),
    devices: rows,
    totals: {
      ...totals,
      activeHours: Number((totals.activeSeconds / 3600).toFixed(2)),
    },
    top: rows[0] ?? null,
    least:
      rows.length > 0
        ? [...rows].sort((a, b) => a.revenueMinor - b.revenueMinor)[0]
        : null,
  };
}

export async function productsReport(query = {}) {
  const range = resolveReportRange(query, { defaultPeriod: 'month' });

  const [soldRows, products] = await Promise.all([
    Invoice.aggregate([
      { $match: { issuedAt: { $gte: range.from, $lt: range.to } } },
      { $unwind: '$lines' },
      { $match: { 'lines.kind': 'product' } },
      {
        $group: {
          _id: '$lines.meta.productId',
          name: { $first: '$lines.description' },
          sku: { $first: '$lines.meta.sku' },
          qty: { $sum: '$lines.qty' },
          revenueMinor: { $sum: '$lines.lineTotalMinor' },
          costMinor: { $sum: '$lines.costMinor' },
        },
      },
      { $sort: { revenueMinor: -1 } },
    ]),
    Product.find({ isDeleted: false }).select('name sku stockQty sellingPriceMinor').lean(),
  ]);

  const sold = soldRows.map((row) => ({
    productId: row._id ? String(row._id) : null,
    name: row.name,
    sku: row.sku,
    qty: row.qty,
    revenueMinor: row.revenueMinor,
    costMinor: row.costMinor,
    marginMinor: row.revenueMinor - row.costMinor,
    marginPercent: row.revenueMinor
      ? Number((((row.revenueMinor - row.costMinor) / row.revenueMinor) * 100).toFixed(1))
      : 0,
  }));

  const soldIds = new Set(sold.map((row) => row.productId).filter(Boolean));
  const slowMovers = products
    .filter((product) => !soldIds.has(String(product._id)))
    .map((product) => ({
      productId: String(product._id),
      name: product.name,
      sku: product.sku,
      stockQty: product.stockQty,
      sellingPriceMinor: product.sellingPriceMinor,
    }))
    .sort((a, b) => b.stockQty - a.stockQty)
    .slice(0, 50);

  const totals = sold.reduce(
    (sum, row) => ({
      qty: sum.qty + row.qty,
      revenueMinor: sum.revenueMinor + row.revenueMinor,
      costMinor: sum.costMinor + row.costMinor,
      marginMinor: sum.marginMinor + row.marginMinor,
    }),
    { qty: 0, revenueMinor: 0, costMinor: 0, marginMinor: 0 },
  );

  return {
    range: presentRange(range),
    products: sold,
    slowMovers,
    totals,
  };
}

export async function inventoryReport() {
  const [valuation, products] = await Promise.all([
    inventoryValuation(),
    Product.find({ isDeleted: false }).select('name sku stockQty minStockQty purchasePriceMinor sellingPriceMinor isActive').lean(),
  ]);

  const toRow = (product) => ({
    productId: String(product._id),
    name: product.name,
    sku: product.sku,
    stockQty: product.stockQty,
    minStockQty: product.minStockQty,
    purchasePriceMinor: product.purchasePriceMinor,
    sellingPriceMinor: product.sellingPriceMinor,
    valueMinor: product.stockQty * product.purchasePriceMinor,
  });

  const lowStock = products
    .filter((product) => product.stockQty <= product.minStockQty)
    .map(toRow)
    .sort((a, b) => a.stockQty - b.stockQty);

  const outOfStock = products
    .filter((product) => product.stockQty <= 0)
    .map(toRow)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  return {
    totals: {
      productCount: valuation.products.length,
      totalCostMinor: valuation.totalCostMinor,
      totalRetailMinor: valuation.totalRetailMinor,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      potentialMarginMinor: valuation.totalRetailMinor - valuation.totalCostMinor,
    },
    products: valuation.products,
    lowStock,
    outOfStock,
  };
}

// ── CSV export ───────────────────────────────────────────────────────────────

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

const moneyCell = (minor) => (Number(minor ?? 0) / 100).toFixed(2);

export async function exportReport(report, query = {}) {
  let filename;
  let csv;

  switch (report) {
    case 'summary': {
      const data = await summary(query);
      filename = `hamatrix-summary-${data.range.fromDate}_${data.range.toDate}.csv`;
      csv = toCsv(
        [
          { label: 'من', value: () => data.range.fromDate },
          { label: 'إلى', value: () => data.range.toDate },
          { label: 'عدد الفواتير', value: () => data.revenue.invoiceCount },
          { label: 'إيراد الألعاب (ج.م)', value: () => moneyCell(data.revenue.gamingMinor) },
          { label: 'إيراد الكافيتريا (ج.م)', value: () => moneyCell(data.revenue.cafeteriaMinor) },
          { label: 'إجمالي الإيراد (ج.م)', value: () => moneyCell(data.revenue.revenueMinor) },
          { label: 'تكلفة البضاعة (ج.م)', value: () => moneyCell(data.costs.cogsMinor) },
          { label: 'المصروفات (ج.م)', value: () => moneyCell(data.expenses.totalMinor) },
          { label: 'الصافي (ج.م)', value: () => moneyCell(data.netMinor) },
        ],
        [data],
      );
      break;
    }
    case 'records': {
      const data = await records({ ...query, limit: 2000 });
      filename = `hamatrix-records-${data.range.fromDate}_${data.range.toDate}.csv`;
      csv = toCsv(
        [
          { label: 'الوقت', value: (row) => dayjs(row.at).tz(TZ).format('YYYY-MM-DD HH:mm') },
          { label: 'النوع', value: (row) => row.kind },
          { label: 'الوصف', value: (row) => row.title },
          { label: 'اللاعب', value: (row) => row.playerName },
          { label: 'المبلغ (ج.م)', value: (row) => (row.amountMinor === null ? '' : moneyCell(row.amountMinor)) },
          { label: 'المرجع', value: (row) => row.ref?.number ?? row.ref?.id ?? '' },
        ],
        data.items,
      );
      break;
    }
    case 'revenue': {
      const data = await revenueDaily(query);
      filename = `hamatrix-revenue-${data.range.fromDate}_${data.range.toDate}.csv`;
      csv = toCsv(
        [
          { label: 'التاريخ', value: (row) => row.date },
          { label: 'عدد الفواتير', value: (row) => row.invoiceCount },
          { label: 'إيراد الألعاب (ج.م)', value: (row) => moneyCell(row.gamingMinor) },
          { label: 'إيراد الكافيتريا (ج.م)', value: (row) => moneyCell(row.cafeteriaMinor) },
          { label: 'الإجمالي (ج.م)', value: (row) => moneyCell(row.revenueMinor) },
          { label: 'تكلفة البضاعة (ج.م)', value: (row) => moneyCell(row.cogsMinor) },
          { label: 'الصافي (ج.م)', value: (row) => moneyCell(row.netMinor) },
        ],
        data.series,
      );
      break;
    }
    case 'devices': {
      const data = await devicesReport(query);
      filename = `hamatrix-devices-${data.range.fromDate}_${data.range.toDate}.csv`;
      csv = toCsv(
        [
          { label: 'الجهاز', value: (row) => row.name },
          { label: 'الكود', value: (row) => row.code },
          { label: 'عدد الجلسات', value: (row) => row.sessions },
          { label: 'ساعات اللعب', value: (row) => row.activeHours },
          { label: 'الإيراد (ج.م)', value: (row) => moneyCell(row.revenueMinor) },
          { label: 'نسبة الاستغلال %', value: (row) => row.utilizationPercent },
        ],
        data.devices,
      );
      break;
    }
    case 'products': {
      const data = await productsReport(query);
      filename = `hamatrix-products-${data.range.fromDate}_${data.range.toDate}.csv`;
      csv = toCsv(
        [
          { label: 'المنتج', value: (row) => row.name },
          { label: 'SKU', value: (row) => row.sku },
          { label: 'الكمية المباعة', value: (row) => row.qty },
          { label: 'الإيراد (ج.م)', value: (row) => moneyCell(row.revenueMinor) },
          { label: 'التكلفة (ج.م)', value: (row) => moneyCell(row.costMinor) },
          { label: 'الهامش (ج.م)', value: (row) => moneyCell(row.marginMinor) },
        ],
        data.products,
      );
      break;
    }
    case 'inventory': {
      const data = await inventoryReport();
      filename = 'hamatrix-inventory.csv';
      csv = toCsv(
        [
          { label: 'المنتج', value: (row) => row.name },
          { label: 'SKU', value: (row) => row.sku },
          { label: 'الكمية', value: (row) => row.stockQty },
          { label: 'سعر الشراء (ج.م)', value: (row) => moneyCell(row.purchasePriceMinor) },
          { label: 'قيمة التكلفة (ج.م)', value: (row) => moneyCell(row.valueMinor) },
          { label: 'سعر البيع (ج.م)', value: (row) => moneyCell(row.sellingPriceMinor) },
        ],
        data.products,
      );
      break;
    }
    default: {
      throw errors.validation([{ path: 'report', message: 'تقرير غير معروف' }]);
    }
  }

  return { filename, csv };
}
