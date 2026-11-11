import { z } from 'zod';
import { BILLING_MODE_VALUES } from '../../utils/enums.js';
import { objectIdSchema, paginationSchema } from '../../utils/validation.js';

const startFields = {
  deviceId: objectIdSchema,
  billingMode: z.enum(BILLING_MODE_VALUES).optional(),
  durationMinutes: z.number().int('المدة يجب أن تكون عددًا صحيحًا').min(5).max(1440).optional().nullable(),
  pricingOptionKey: z.string().trim().max(32).optional().nullable(),
  notes: z.string().trim().max(300).optional(),
};

const requireDurationWhenFixed = (data, ctx) => {
  if (data.billingMode === 'fixed' && !data.durationMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationMinutes'],
      message: 'المدة مطلوبة للجلسة المحددة',
    });
  }
};

export const startSessionSchema = z.object(startFields).strict().superRefine(requireDurationWhenFixed);

export const createSessionSchema = z
  .object({ ...startFields, visitId: objectIdSchema.optional() })
  .strict()
  .superRefine(requireDurationWhenFixed);

export const pauseSessionSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const endSessionSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const extendSessionSchema = z
  .object({
    minutes: z.number().int('المدة يجب أن تكون عددًا صحيحًا').min(1).max(720),
  })
  .strict();

export const listActiveSessionsQuerySchema = paginationSchema;
