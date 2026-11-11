import { STOCK_MOVEMENT_TYPE } from '../../utils/enums.js';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { StockMovement } from './movement.model.js';
import { Product } from '../products/model.js';
import { errors } from '../../utils/errors.js';
import { withTransaction } from '../../utils/txn.js';
import { resolveSort, paginationMeta, dayStringSchema } from '../../utils/validation.js';
import { businessDayRange, DEFAULT_TIMEZONE, dayjs } from '../../utils/time.js';

/**
 * BR-13 / BR-15: every stock change goes through this function and writes a
 * movement row with before/after quantities and the responsible actor.
 */
export async function recordMovement({
  product,
  type,
  qtyDelta,
  qtyBefore,
  qtyAfter,
  unitCostMinor = 0,
  supplierName = '',
  reference = {},
  note = '',
  actorId = null,
  session,
}) {
  await StockMovement.create(
    [
      {
        product: product._id ?? product,
        productSnapshot: { name: product.name ?? '', sku: product.sku ?? '' },
        type,
        qtyDelta,
        qtyBefore,
        qtyAfter,
        unitCostMinor,
        valueDeltaMinor: qtyDelta * unitCostMinor,
        supplierName,
        reference,
        note,
        actor: actorId,
      },
    ],
    session ? { session } : undefined,
  );
}

function presentMovement(movement) {
  return {
    id: String(movement._id),
    productId: movement.product ? String(movement.product) : null,
    product: movement.productSnapshot,
    type: movement.type,
    qtyDelta: movement.qtyDelta,
    qtyBefore: movement.qtyBefore,
    qtyAfter: movement.qtyAfter,
    unitCostMinor: movement.unitCostMinor,
    valueDeltaMinor: movement.valueDeltaMinor,
    supplierName: movement.supplierName ?? '',
    reference: movement.reference,
    note: movement.note,
    createdAt: movement.createdAt,
  };
}

export async function listMovements(query) {
  const { page, limit, sort, productId, type, referenceId, from, to } = query;
  const filter = {};
  if (productId) filter.product = productId;
  if (type) filter.type = type;
  if (referenceId) filter['reference.id'] = referenceId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = businessDayRange(from, DEFAULT_TIMEZONE).start;
    if (to) filter.createdAt.$lt = businessDayRange(to, DEFAULT_TIMEZONE).end;
  }

  const sortObject = resolveSort(sort, ['createdAt', 'qtyDelta', 'type'], '-createdAt');
  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockMovement.countDocuments(filter),
  ]);

  return {
    movements: movements.map(presentMovement),
    pagination: paginationMeta(total, page, limit),
  };
}

export async function stockIn(input, actorId) {
  return withTransaction(async (session) => {
    const product = await Product.findOne({ _id: input.productId, isDeleted: false }).session(session);
    if (!product) throw errors.notFound('المنتج');

    const qtyBefore = product.stockQty;
    const qtyAfter = qtyBefore + input.qty;

    product.stockQty = qtyAfter;
    product.purchasePriceMinor = input.unitCostMinor;
    await product.save({ session });

    await recordMovement({
      product,
      type: STOCK_MOVEMENT_TYPE.PURCHASE,
      qtyDelta: input.qty,
      qtyBefore,
      qtyAfter,
      unitCostMinor: input.unitCostMinor,
      supplierName: input.supplierName ?? '',
      reference: { kind: 'manual', id: null, number: product.sku },
      note: input.note ?? '',
      actorId,
      session,
    });

    return {
      product: {
        id: String(product._id),
        name: product.name,
        sku: product.sku,
        stockQty: product.stockQty,
        purchasePriceMinor: product.purchasePriceMinor,
      },
      movement: {
        qtyDelta: input.qty,
        qtyBefore,
        qtyAfter,
        unitCostMinor: input.unitCostMinor,
      },
    };
  });
}

export async function adjustStock(input, actorId) {
  return withTransaction(async (session) => {
    const product = await Product.findOne({ _id: input.productId, isDeleted: false }).session(session);
    if (!product) throw errors.notFound('المنتج');

    const qtyBefore = product.stockQty;
    const qtyAfter = qtyBefore + input.qtyDelta;

    if (qtyAfter < 0) {
      throw errors.business(
        ERROR_CODES.STOCK_NEGATIVE,
        'الكمية بعد التسوية لا يمكن أن تكون سالبة',
        { productId: String(product._id), qtyBefore, qtyDelta: input.qtyDelta },
      );
    }

    product.stockQty = qtyAfter;
    await product.save({ session });

    // BR-64: adjustments use the current last cost for valuation purposes.
    await recordMovement({
      product,
      type: input.type,
      qtyDelta: input.qtyDelta,
      qtyBefore,
      qtyAfter,
      unitCostMinor: product.purchasePriceMinor,
      reference: { kind: 'manual', id: null, number: product.sku },
      note: input.reason,
      actorId,
      session,
    });

    return {
      product: {
        id: String(product._id),
        name: product.name,
        sku: product.sku,
        stockQty: product.stockQty,
      },
      movement: { qtyDelta: input.qtyDelta, qtyBefore, qtyAfter },
    };
  });
}

async function totalsRow() {
  const rows = await Product.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalValueMinor: { $sum: { $multiply: ['$stockQty', '$purchasePriceMinor'] } },
        totalUnits: { $sum: '$stockQty' },
        products: { $sum: 1 },
      },
    },
  ]);
  return rows[0] ?? { totalValueMinor: 0, totalUnits: 0, products: 0 };
}

export async function inventorySummary({ date } = {}) {
  const day = date && dayStringSchema.safeParse(date).success ? date : dayjs().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD');
  const range = businessDayRange(day, DEFAULT_TIMEZONE);

  const [totals, lowCount, outCount, movementRows] = await Promise.all([
    totalsRow(),
    Product.countDocuments({
      isDeleted: false,
      isActive: true,
      $expr: { $lte: ['$stockQty', '$minStockQty'] },
    }),
    Product.countDocuments({ isDeleted: false, stockQty: { $lte: 0 } }),
    StockMovement.aggregate([
      { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          units: { $sum: '$qtyDelta' },
          valueMinor: { $sum: '$valueDeltaMinor' },
        },
      },
    ]),
  ]);

  const movements = {};
  for (const row of movementRows) {
    movements[row._id] = { count: row.count, units: row.units, valueMinor: row.valueMinor };
  }

  return {
    date: day,
    inventoryValueMinor: totals.totalValueMinor,
    totalUnits: totals.totalUnits,
    productCount: totals.products,
    lowStockCount: lowCount,
    outOfStockCount: outCount,
    todayMovements: movements,
  };
}

export async function inventoryValuation() {
  const products = await Product.find({ isDeleted: false })
    .sort({ name: 1 })
    .lean();

  const rows = products.map((product) => ({
    id: String(product._id),
    name: product.name,
    sku: product.sku,
    stockQty: product.stockQty,
    purchasePriceMinor: product.purchasePriceMinor,
    sellingPriceMinor: product.sellingPriceMinor,
    valueMinor: product.stockQty * product.purchasePriceMinor,
    retailValueMinor: product.stockQty * product.sellingPriceMinor,
  }));

  return {
    products: rows,
    totalCostMinor: rows.reduce((sum, row) => sum + row.valueMinor, 0),
    totalRetailMinor: rows.reduce((sum, row) => sum + row.retailValueMinor, 0),
  };
}
