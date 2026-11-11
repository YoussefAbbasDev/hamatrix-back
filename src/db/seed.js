import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { User } from '../modules/users/model.js';
import { ProductCategory } from '../modules/products/category.model.js';
import { ExpenseCategory } from '../modules/expenses/category.model.js';
import { ensureSettings } from '../modules/settings/service.js';
import { connectDb, disconnectDb } from './connect.js';

const PRODUCT_CATEGORIES = [
  { name: 'مشروبات', slug: 'drinks', color: '#22D3EE', sortOrder: 1 },
  { name: 'سناكس', slug: 'snacks', color: '#8B5CFF', sortOrder: 2 },
  { name: 'أكل', slug: 'food', color: '#F59E0B', sortOrder: 3 },
  { name: 'أخرى', slug: 'other', color: '#94A3B8', sortOrder: 4 },
];

const EXPENSE_CATEGORIES = [
  { name: 'كهربا', slug: 'electricity' },
  { name: 'إيجار', slug: 'rent' },
  { name: 'صيانة', slug: 'maintenance' },
  { name: 'رواتب', slug: 'salaries' },
  { name: 'إنترنت', slug: 'internet' },
  { name: 'مستلزمات كافيتريا', slug: 'cafeteria-supplies' },
  { name: 'أخرى', slug: 'other-expenses' },
];

/** BR-82: default catalog categories exist on a fresh install and stay editable. */
async function seedCategories() {
  await Promise.all(
    PRODUCT_CATEGORIES.map((category) =>
      ProductCategory.updateOne(
        { name: category.name },
        {
          $setOnInsert: {
            name: category.name,
            slug: category.slug,
            color: category.color,
            sortOrder: category.sortOrder,
            isActive: true,
          },
        },
        { upsert: true },
      ),
    ),
  );

  await Promise.all(
    EXPENSE_CATEGORIES.map((category) =>
      ExpenseCategory.updateOne(
        { name: category.name },
        {
          $setOnInsert: {
            name: category.name,
            slug: category.slug,
            isSystem: true,
            isActive: true,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

/**
 * Idempotent bootstrap: settings always exist; the first admin is created only
 * when no user exists. Existing credentials are never overwritten.
 */
export async function ensureBootstrap() {
  await ensureSettings();
  await seedCategories();

  const userCount = await User.countDocuments();
  if (userCount > 0) {
    return { createdUser: false };
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await User.create({
    username: env.ADMIN_USERNAME.toLowerCase(),
    passwordHash,
    displayName: env.ADMIN_DISPLAY_NAME,
    mustChangePassword: false,
  });

  logger.warn(
    { username: env.ADMIN_USERNAME },
    'Seeded the first admin account. Change the password from Settings.',
  );

  return { createdUser: true };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    await connectDb();
    const result = await ensureBootstrap();
    // eslint-disable-next-line no-console
    console.log(
      result.createdUser
        ? `Seed complete. Admin: ${env.ADMIN_USERNAME} / ${env.ADMIN_PASSWORD}`
        : 'Seed complete. Admin already exists (credentials untouched).',
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
