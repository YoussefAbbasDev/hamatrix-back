import { VISIT_STATUS } from '../../utils/enums.js';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { Product } from './model.js';
import { ProductCategory } from './category.model.js';
import { Visit } from '../visits/model.js';
import { StockMovement } from '../inventory/movement.model.js';
import { errors } from '../../utils/errors.js';
import { audit } from '../audit/service.js';
import { withTransaction } from '../../utils/txn.js';
import { nextSequence, padSequence } from '../../utils/ids.js';
import { resolveSort, paginationMeta } from '../../utils/validation.js';

export function presentProduct(product, { reservedQty = 0 } = {}) {
  const category =
    product.category && typeof product.category === 'object' && product.category.name
      ? { id: String(product.category._id), name: product.category.name, color: product.category.color }
      : product.category
        ? { id: String(product.category), name: null, color: null }
        : null;

  return {
    id: String(product._id),
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? null,
    category,
    unit: product.unit,
    sellingPriceMinor: product.sellingPriceMinor,
    purchasePriceMinor: product.purchasePriceMinor,
    stockQty: product.stockQty,
    minStockQty: product.minStockQty,
    reservedQty,
    availableQty: product.stockQty - reservedQty,
    isLowStock: product.stockQty <= product.minStockQty,
    isOutOfStock: product.stockQty <= 0,
    description: product.description ?? '',
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

/**
 * BR-57: available quantity = stockQty − reserved quantity in open visits.
 * Reservations are read-only; nothing is deducted until checkout (BR-60).
 */
export async function reservedByProduct({ excludeVisitId = null, session = null } = {}) {
  const match = { status: VISIT_STATUS.OPEN };
  if (excludeVisitId) match._id = { $ne: excludeVisitId };

  let pipeline = Visit.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', qty: { $sum: '$items.qty' } } },
  ]);
  if (session) pipeline = pipeline.session(session);

  const rows = await pipeline;
  return new Map(rows.map((row) => [String(row._id), row.qty]));
}

export async function listProducts(query) {
  const { page, limit, sort, q, categoryId, isActive, lowStock, inStock } = query;

  const filter = { isDeleted: false };
  if (categoryId) filter.category = categoryId;
  if (isActive !== undefined) filter.isActive = isActive;
  if (lowStock) filter.$expr = { $lte: ['$stockQty', '$minStockQty'] };
  if (inStock) filter.stockQty = { $gt: 0 };
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
  }

  const sortObject = resolveSort(sort, ['name', 'sku', 'stockQty', 'createdAt', 'sellingPriceMinor'], 'name');
  const [products, total, reserved] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name color')
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
    reservedByProduct(),
  ]);

  return {
    products: products.map((product) =>
      presentProduct(product, { reservedQty: reserved.get(String(product._id)) ?? 0 }),
    ),
    pagination: paginationMeta(total, page, limit),
  };
}

export async function getProduct(id) {
  const product = await Product.findOne({ _id: id, isDeleted: false })
    .populate('category', 'name color')
    .lean();
  if (!product) throw errors.notFound('المنتج');

  const [reserved, movements] = await Promise.all([
    reservedByProduct(),
    StockMovement.find({ product: product._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  return {
    product: presentProduct(product, { reservedQty: reserved.get(String(product._id)) ?? 0 }),
    movements: movements.map((movement) => ({
      id: String(movement._id),
      type: movement.type,
      qtyDelta: movement.qtyDelta,
      qtyBefore: movement.qtyBefore,
      qtyAfter: movement.qtyAfter,
      unitCostMinor: movement.unitCostMinor,
      note: movement.note,
      createdAt: movement.createdAt,
    })),
  };
}

export async function createProduct(input, actorId) {
  const category = input.categoryId
    ? await ProductCategory.findById(input.categoryId).lean()
    : null;
  if (input.categoryId && !category) throw errors.notFound('التصنيف');

  return withTransaction(async (session) => {
    const data = {
      name: input.name,
      category: input.categoryId ?? null,
      unit: input.unit ?? 'قطعة',
      sellingPriceMinor: input.sellingPriceMinor,
      purchasePriceMinor: input.purchasePriceMinor ?? 0,
      stockQty: input.stockQty ?? 0,
      minStockQty: input.minStockQty ?? 0,
      description: input.description ?? '',
      barcode: input.barcode || null,
    };

    if (input.sku) {
      data.sku = input.sku.toUpperCase();
    } else {
      const seq = await nextSequence('product', { session });
      data.sku = `PRD-${padSequence(seq, 4)}`;
    }

    const [product] = await Product.create([data], { session });
    if (data.category) await product.populate('category', 'name color');

    if (product.stockQty > 0) {
      await StockMovement.create(
        [
          {
            product: product._id,
            productSnapshot: { name: product.name, sku: product.sku },
            type: 'initial',
            qtyDelta: product.stockQty,
            qtyBefore: 0,
            qtyAfter: product.stockQty,
            unitCostMinor: product.purchasePriceMinor,
            valueDeltaMinor: product.stockQty * product.purchasePriceMinor,
            reference: { kind: 'product', id: product._id, number: product.sku },
            note: 'رصيد افتتاحي',
            actor: actorId,
          },
        ],
        { session },
      );
    }

    return presentProduct(product.toObject());
  });
}

export async function updateProduct(id, patch, actorId, req) {
  const product = await Product.findOne({ _id: id, isDeleted: false });
  if (!product) throw errors.notFound('المنتج');

  if (patch.categoryId) {
    const category = await ProductCategory.findById(patch.categoryId).lean();
    if (!category) throw errors.notFound('التصنيف');
    product.category = category._id;
  } else if (patch.categoryId === null) {
    product.category = null;
  }

  if (patch.isActive === false) {
    const referenced = await Visit.exists({
      status: VISIT_STATUS.OPEN,
      'items.product': product._id,
    });
    if (referenced) {
      throw errors.conflict(
        ERROR_CODES.CONFLICT_STATE,
        'المنتج موجود في زيارة مفتوحة. لا يمكن تعطيله الآن.',
      );
    }
  }

  const before = {
    sellingPriceMinor: product.sellingPriceMinor,
    purchasePriceMinor: product.purchasePriceMinor,
  };

  for (const field of [
    'name',
    'sku',
    'barcode',
    'unit',
    'sellingPriceMinor',
    'purchasePriceMinor',
    'minStockQty',
    'description',
    'isActive',
  ]) {
    if (patch[field] !== undefined) product[field] = patch[field];
  }
  if (patch.sku !== undefined) product.sku = patch.sku.toUpperCase();

  await product.save();

  if (product.category) await product.populate('category', 'name color');

  if (
    before.sellingPriceMinor !== product.sellingPriceMinor ||
    before.purchasePriceMinor !== product.purchasePriceMinor
  ) {
    await audit({
      action: 'PRODUCT_PRICE_CHANGED',
      entityType: 'Product',
      entityId: product._id,
      actorId,
      before,
      after: {
        sellingPriceMinor: product.sellingPriceMinor,
        purchasePriceMinor: product.purchasePriceMinor,
      },
      req,
    });
  }

  return presentProduct(product.toObject());
}

export async function deleteProduct(id) {
  const product = await Product.findOne({ _id: id, isDeleted: false });
  if (!product) throw errors.notFound('المنتج');

  const referenced = await Visit.exists({
    status: VISIT_STATUS.OPEN,
    'items.product': product._id,
  });
  if (referenced) {
    throw errors.conflict(
      ERROR_CODES.CONFLICT_STATE,
      'المنتج موجود في زيارة مفتوحة. لا يمكن حذفه الآن.',
    );
  }

  product.isDeleted = true;
  product.deletedAt = new Date();
  product.isActive = false;
  await product.save();

  return { id: String(product._id) };
}

export async function lowStockProducts() {
  const products = await Product.find({
    isDeleted: false,
    isActive: true,
    $expr: { $lte: ['$stockQty', '$minStockQty'] },
  })
    .sort({ stockQty: 1 })
    .lean();

  const reserved = await reservedByProduct();
  return products.map((product) =>
    presentProduct(product, { reservedQty: reserved.get(String(product._id)) ?? 0 }),
  );
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(name) {
  const base = slugify(name);
  if (!base) {
    const seq = await nextSequence('product_category');
    return `cat-${padSequence(seq, 3)}`;
  }
  let candidate = base;
  let counter = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await ProductCategory.exists({ slug: candidate })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export async function listCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const categories = await ProductCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  return categories.map((category) => ({
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  }));
}

export async function createCategory(input) {
  const category = await ProductCategory.create({
    name: input.name,
    slug: await uniqueSlug(input.name),
    color: input.color ?? '#8B5CFF',
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  });

  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export async function updateCategory(id, patch) {
  const category = await ProductCategory.findById(id);
  if (!category) throw errors.notFound('التصنيف');

  if (patch.name !== undefined && patch.name !== category.name) {
    category.name = patch.name;
    category.slug = await uniqueSlug(patch.name);
  }
  if (patch.color !== undefined) category.color = patch.color;
  if (patch.sortOrder !== undefined) category.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) category.isActive = patch.isActive;

  await category.save();
  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export async function deleteCategory(id) {
  const category = await ProductCategory.findById(id);
  if (!category) throw errors.notFound('التصنيف');

  const used = await Product.exists({ category: category._id, isDeleted: false });
  if (used) {
    throw errors.conflict(
      ERROR_CODES.CONFLICT_STATE,
      'يوجد منتجات في هذا التصنيف. انقلها أو احذفها أولًا.',
    );
  }

  await category.deleteOne();
  return { id: String(id) };
}
