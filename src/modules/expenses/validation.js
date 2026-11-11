import { z } from 'zod';
import {
  objectIdSchema,
  paginationSchema,
  dayStringSchema,
  positiveMinor,
  dateRangeFields,
} from '../../utils/validation.js';

export const createExpenseSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان المصروف مطلوب').max(120),
    amountMinor: positiveMinor('المبلغ'),
    categoryId: objectIdSchema.optional().nullable(),
    expenseDate: dayStringSchema.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const updateExpenseSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    amountMinor: positiveMinor('المبلغ').optional(),
    categoryId: objectIdSchema.optional().nullable(),
    expenseDate: dayStringSchema.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });

export const listExpensesQuerySchema = paginationSchema
  .extend({
    categoryId: objectIdSchema.optional(),
    q: z.string().trim().max(80).optional(),
    minAmountMinor: z.coerce.number().int().min(0).optional(),
    maxAmountMinor: z.coerce.number().int().min(0).optional(),
    ...dateRangeFields,
  })
  .strict();

export const deleteExpenseSchema = z
  .object({
    confirm: z.literal(true, {
      errorMap: () => ({ message: 'يجب تأكيد الحذف' }),
    }),
  })
  .strict();

export const createExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'اسم التصنيف مطلوب').max(60),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });
