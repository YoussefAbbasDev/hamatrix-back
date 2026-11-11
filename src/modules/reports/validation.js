import { z } from 'zod';
import { dayStringSchema } from '../../utils/validation.js';

const periodSchema = z.enum(['day', 'month', 'all']).optional();

// `date` is the shorthand the UI uses for a single business day; the service
// resolves it into a one-day range before looking at `period`.
const rangeFields = {
  period: periodSchema,
  date: dayStringSchema.optional(),
  from: dayStringSchema.optional(),
  to: dayStringSchema.optional(),
};

const csvField = {
  export: z.enum(['csv']).optional(),
};

export const dashboardChartsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(14),
  })
  .strict();

export const summaryQuerySchema = z.object({ ...rangeFields, ...csvField }).strict();

export const recordsQuerySchema = z
  .object({
    ...rangeFields,
    ...csvField,
    limit: z.coerce.number().int().min(1).max(2000).default(500),
  })
  .strict();

export const revenueDailyQuerySchema = z.object({ ...rangeFields, ...csvField }).strict();

export const devicesReportQuerySchema = z.object({ ...rangeFields, ...csvField }).strict();

export const productsReportQuerySchema = z.object({ ...rangeFields, ...csvField }).strict();

export const inventoryReportQuerySchema = z.object({ ...csvField }).strict();

export const exportQuerySchema = z
  .object({
    report: z.enum(['summary', 'records', 'revenue', 'devices', 'products', 'inventory']),
    ...rangeFields,
    limit: z.coerce.number().int().min(1).max(2000).default(500),
  })
  .strict();
