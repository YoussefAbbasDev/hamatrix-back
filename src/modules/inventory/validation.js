import { z } from 'zod';
import { STOCK_MOVEMENT_VALUES } from '../../utils/enums.js';
import {
  objectIdSchema,
  paginationSchema,
  nonNegativeMinor,
  dateRangeFields,
} from '../../utils/validation.js';

export const stockInSchema = z
  .object({
    productId: objectIdSchema,
    qty: z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(1, 'الكمية يجب أن تكون 1 على الأقل'),
    unitCostMinor: nonNegativeMinor('سعر الشراء'),
    supplierName: z.string().trim().max(120).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    productId: objectIdSchema,
    qtyDelta: z
      .number()
      .int('الكمية يجب أن تكون عددًا صحيحًا')
      .refine((value) => value !== 0, 'الفرق لا يمكن أن يكون صفرًا'),
    type: z.enum(['adjustment', 'damage', 'waste']),
    reason: z.string().trim().min(1, 'سبب التسوية مطلوب').max(300),
  })
  .strict();

export const listMovementsQuerySchema = paginationSchema
  .extend({
    productId: objectIdSchema.optional(),
    type: z.enum(STOCK_MOVEMENT_VALUES).optional(),
    referenceId: objectIdSchema.optional(),
    ...dateRangeFields,
  })
  .strict();

export const summaryQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
