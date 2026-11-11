import { ExpenseCategory } from './category.model.js';
import { Expense } from './model.js';
import { errors } from '../../utils/errors.js';
import { nextSequence, padSequence } from '../../utils/ids.js';
import { resolveSort, paginationMeta } from '../../utils/validation.js';
import { businessDayRange, DEFAULT_TIMEZONE, dayjs } from '../../utils/time.js';
import { emitEvent, SOCKET_EVENTS } from '../../sockets/events.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function todayInCairo() {
  return dayjs().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD');
}

function presentExpense(expense) {
  return {
    id: String(expense._id),
    title: expense.title,
    amountMinor: expense.amountMinor,
    categoryId: expense.category ? String(expense.category) : null,
    categoryName: expense.categoryNameSnapshot ?? '',
    expenseDate: expense.expenseDate,
    note: expense.note ?? '',
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

export async function listExpenses(query) {
  const { page, limit, sort, categoryId, q, minAmountMinor, maxAmountMinor, from, to } = query;

  const filter = {};
  if (categoryId) filter.category = categoryId;
  if (minAmountMinor !== undefined || maxAmountMinor !== undefined) {
    filter.amountMinor = {};
    if (minAmountMinor !== undefined) filter.amountMinor.$gte = minAmountMinor;
    if (maxAmountMinor !== undefined) filter.amountMinor.$lte = maxAmountMinor;
  }
  if (from || to) {
    filter.expenseDate = {};
    if (from) filter.expenseDate.$gte = businessDayRange(from, DEFAULT_TIMEZONE).start;
    if (to) filter.expenseDate.$lt = businessDayRange(to, DEFAULT_TIMEZONE).end;
  }
  if (q) {
    filter.title = new RegExp(escapeRegex(q), 'i');
  }

  const sortObject = resolveSort(sort, ['expenseDate', 'amountMinor', 'createdAt'], '-expenseDate');
  const [expenses, total, totals] = await Promise.all([
    Expense.find(filter)
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $group: { _id: null, amountMinor: { $sum: '$amountMinor' } } }]),
  ]);

  return {
    expenses: expenses.map(presentExpense),
    totalAmountMinor: totals[0]?.amountMinor ?? 0,
    pagination: paginationMeta(total, page, limit),
  };
}

export async function getExpense(expenseId) {
  const expense = await Expense.findById(expenseId).lean();
  if (!expense) throw errors.notFound('المصروف');
  return { expense: presentExpense(expense) };
}

async function resolveCategory(categoryId) {
  if (!categoryId) return null;
  const category = await ExpenseCategory.findById(categoryId).lean();
  if (!category) throw errors.notFound('تصنيف المصروف');
  return category;
}

export async function createExpense(input, actorId) {
  const category = await resolveCategory(input.categoryId);
  const date = input.expenseDate ?? todayInCairo();
  const expense = await Expense.create({
    title: input.title,
    amountMinor: input.amountMinor,
    category: category?._id ?? null,
    categoryNameSnapshot: category?.name ?? '',
    expenseDate: businessDayRange(date, DEFAULT_TIMEZONE).start,
    note: input.note ?? '',
    actor: actorId,
  });

  emitEvent(SOCKET_EVENTS.EXPENSE_CREATED, { expenseId: String(expense._id) });
  return { expense: presentExpense(expense.toObject()) };
}

export async function updateExpense(expenseId, patch) {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw errors.notFound('المصروف');

  if (patch.title !== undefined) expense.title = patch.title;
  if (patch.amountMinor !== undefined) expense.amountMinor = patch.amountMinor;
  if (patch.note !== undefined) expense.note = patch.note;
  if (patch.expenseDate !== undefined) {
    expense.expenseDate = businessDayRange(patch.expenseDate, DEFAULT_TIMEZONE).start;
  }
  if (patch.categoryId !== undefined) {
    const category = await resolveCategory(patch.categoryId);
    expense.category = category?._id ?? null;
    expense.categoryNameSnapshot = category?.name ?? '';
  }

  await expense.save();
  emitEvent(SOCKET_EVENTS.EXPENSE_CREATED, { expenseId: String(expense._id) });
  return { expense: presentExpense(expense.toObject()) };
}

export async function deleteExpense(expenseId) {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw errors.notFound('المصروف');
  await expense.deleteOne();
  emitEvent(SOCKET_EVENTS.EXPENSE_CREATED, { expenseId: String(expenseId) });
  return { id: String(expenseId) };
}

// ── categories ───────────────────────────────────────────────────────────────

function presentCategory(category) {
  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    isSystem: category.isSystem,
    isActive: category.isActive,
  };
}

export async function listExpenseCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const categories = await ExpenseCategory.find(filter).sort({ isSystem: -1, name: 1 }).lean();
  return categories.map(presentCategory);
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
    const seq = await nextSequence('expense_category');
    return `exp-${padSequence(seq, 3)}`;
  }
  let candidate = base;
  let counter = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await ExpenseCategory.exists({ slug: candidate })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export async function createExpenseCategory(input) {
  const category = await ExpenseCategory.create({
    name: input.name,
    slug: await uniqueSlug(input.name),
    isSystem: false,
    isActive: input.isActive ?? true,
  });
  return { category: presentCategory(category.toObject()) };
}

export async function updateExpenseCategory(categoryId, patch) {
  const category = await ExpenseCategory.findById(categoryId);
  if (!category) throw errors.notFound('تصنيف المصروف');

  if (patch.name !== undefined && patch.name !== category.name) {
    category.name = patch.name;
    category.slug = await uniqueSlug(patch.name);
  }
  if (patch.isActive !== undefined) category.isActive = patch.isActive;

  await category.save();
  return { category: presentCategory(category.toObject()) };
}
