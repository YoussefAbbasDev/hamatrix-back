import { z } from 'zod';
import { DEVICE_STATUS_VALUES } from '../../utils/enums.js';
import { paginationSchema, positiveMinor } from '../../utils/validation.js';

const pricingOptionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'مفتاح الخيار مطلوب')
      .max(32)
      .regex(/^[a-zA-Z0-9_-]+$/, 'المفتاح يقبل حروفًا وأرقامًا وشرطات فقط'),
    name: z.string().trim().min(1, 'اسم الخيار مطلوب').max(40),
    pricePerHourMinor: positiveMinor('سعر الخيار'),
  })
  .strict();

const pricingOptionsSchema = z
  .array(pricingOptionSchema)
  .max(10, 'الحد الأقصى 10 خيارات تسعير')
  .refine(
    (options) =>
      new Set(options.map((option) => option.key.toLowerCase())).size === options.length,
    'مفاتيح خيارات التسعير يجب أن تكون فريدة',
  );

const baseFields = {
  name: z.string().trim().min(1, 'اسم الجهاز مطلوب').max(60),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'الكود يقبل حروفًا وأرقامًا وشرطات فقط')
    .optional(),
  type: z.string().trim().min(1).max(32).optional(),
  hourlyPriceMinor: positiveMinor('سعر الساعة'),
  pricingOptions: pricingOptionsSchema.optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
};

export const createDeviceSchema = z.object(baseFields).strict();

export const updateDeviceSchema = z
  .object({
    name: baseFields.name.optional(),
    code: baseFields.code,
    type: baseFields.type,
    hourlyPriceMinor: baseFields.hourlyPriceMinor.optional(),
    pricingOptions: pricingOptionsSchema.optional(),
    description: baseFields.description,
    isActive: baseFields.isActive,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتحديث' });

export const listDevicesQuerySchema = paginationSchema
  .extend({
    status: z.enum(DEVICE_STATUS_VALUES).optional(),
    type: z.string().trim().max(32).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    q: z.string().trim().max(60).optional(),
  })
  .strict();

export const maintenanceSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const deviceSessionsQuerySchema = paginationSchema
  .extend({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const deviceStatsQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
