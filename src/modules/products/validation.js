import { z } from 'zod';
import {
  objectIdSchema,
  paginationSchema,
  nonNegativeMinor,
  positiveMinor,
} from '../../utils/validation.js';

const nameField = z.string().trim().min(1, 'الاسم مطلوب').max(120);

export const createProductSchema = z
  .object({
    name: nameField,
    sku: z.string().trim().max(40).optional(),
    barcode: z.string().trim().max(64).optional(),
    categoryId: objectIdSchema.optional().nullable(),
    unit: z.string().trim().max(20).optional(),
    sellingPriceMinor: positiveMinor('سعر البيع'),
    purchasePriceMinor: nonNegativeMinor('سعر الشراء').optional(),
    stockQty: z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(0).optional(),
    minStockQty: z.number().int('حد التنبيه يجب أن يكون عددًا صحيحًا').min(0).optional(),
    description: z.string().trim().max(300).optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: nameField.optional(),
    sku: z.string().trim().min(1).max(40).optional(),
    barcode: z.string().trim().max(64).optional().nullable(),
    categoryId: objectIdSchema.optional().nullable(),
    unit: z.string().trim().max(20).optional(),
    sellingPriceMinor: positiveMinor('سعر البيع').optional(),
    purchasePriceMinor: nonNegativeMinor('سعر الشراء').optional(),
    minStockQty: z.number().int().min(0).optional(),
    description: z.string().trim().max(300).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });

export const listProductsQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().max(80).optional(),
    categoryId: objectIdSchema.optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    lowStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const categoryIdParamsSchema = z.object({ id: objectIdSchema }).strict();

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'اسم التصنيف مطلوب').max(60),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح (مثال: #8B5CFF)')
      .optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح (مثال: #8B5CFF)')
      .optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });
