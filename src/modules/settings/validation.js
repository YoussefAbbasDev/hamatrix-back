import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح (مثال: #FF2E93)');

const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'منطقة زمنية غير صالحة');

export const updateSettingsSchema = z
  .object({
    brand: z
      .object({
        name: z.string().trim().min(1).max(60),
        logoUrl: z.string().max(300),
        accentColor: hexColor,
        accentColor2: hexColor,
        receiptHeader: z.string().max(200),
        receiptFooter: z.string().max(200),
      })
      .partial()
      .strict()
      .optional(),
    locale: z
      .object({
        currency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
        currencyMinorUnits: z.number().int().min(0).max(3),
        timezone,
        dateFormat: z.string().max(20),
        timeFormat: z.enum(['12h', '24h']),
      })
      .partial()
      .strict()
      .optional(),
    session: z
      .object({
        defaultBillingMode: z.enum(['open', 'fixed']),
        defaultDurationMinutes: z.number().int().min(5).max(1440),
        alertBeforeEndMinutes: z.number().int().min(0).max(60),
        allowPause: z.boolean(),
        allowManualAmountEdit: z.boolean(),
        maxDurationMinutes: z.number().int().min(5).max(1440),
      })
      .partial()
      .strict()
      .optional(),
    inventory: z
      .object({
        lowStockNotifications: z.boolean(),
        allowNegativeStock: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    ui: z
      .object({
        theme: z.enum(['dark', 'light']),
        reduceEffects: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    invoice: z
      .object({
        prefix: z.string().trim().min(1).max(8),
        storePhone: z.string().max(40),
        storeAddress: z.string().max(200),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد بيانات للتحديث',
  });
