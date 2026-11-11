import { z } from 'zod';
import { VISIT_STATUS_VALUES, VISIT_TYPE_VALUES } from '../../utils/enums.js';
import {
  objectIdSchema,
  paginationSchema,
  dateRangeFields,
} from '../../utils/validation.js';

export const createVisitSchema = z
  .object({
    playerName: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateVisitSchema = z
  .object({
    playerName: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });

export const listVisitsQuerySchema = paginationSchema
  .extend({
    status: z.enum(VISIT_STATUS_VALUES).optional(),
    type: z.enum(VISIT_TYPE_VALUES).optional(),
    q: z.string().trim().max(80).optional(),
    ...dateRangeFields,
  })
  .strict();

export const addVisitItemSchema = z
  .object({
    productId: objectIdSchema,
    qty: z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(1).max(999),
  })
  .strict();

export const updateVisitItemSchema = z
  .object({
    qty: z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(1).max(999),
  })
  .strict();

export const visitItemParamsSchema = z
  .object({ id: objectIdSchema, itemId: objectIdSchema })
  .strict();

export const checkoutSchema = z
  .object({
    adjustmentMinor: z
      .number()
      .int('التعديل يجب أن يكون عددًا صحيحًا بالقروش')
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    adjustmentNote: z.string().trim().max(200).optional(),
  })
  .strict();

export const quickSaleSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: objectIdSchema,
            qty: z.number().int('الكمية يجب أن تكون عددًا صحيحًا').min(1).max(999),
          })
          .strict(),
      )
      .min(1, 'أضف منتجًا واحدًا على الأقل')
      .max(50),
    playerName: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
