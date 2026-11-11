import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'معرّف غير صالح');

export const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD');

export const monthStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'الشهر يجب أن يكون بصيغة YYYY-MM');

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().trim().max(64).optional(),
  })
  .strict();

export const dateRangeFields = {
  from: dayStringSchema.optional(),
  to: dayStringSchema.optional(),
};

export const nonNegativeMinor = (field = 'المبلغ') =>
  z
    .number()
    .int(`${field} يجب أن يكون عددًا صحيحًا بالقروش`)
    .min(0, `${field} لا يمكن أن يكون سالبًا`)
    .max(Number.MAX_SAFE_INTEGER);

export const positiveMinor = (field = 'المبلغ') =>
  z
    .number()
    .int(`${field} يجب أن يكون عددًا صحيحًا بالقروش`)
    .min(1, `${field} يجب أن يكون أكبر من صفر`)
    .max(Number.MAX_SAFE_INTEGER);

/** Safely parses a list of sortable fields and returns a Mongo sort object. */
export function resolveSort(sort, allowed, fallback = '-createdAt') {
  const raw = (sort || fallback).trim();
  const descending = raw.startsWith('-');
  const field = descending ? raw.slice(1) : raw;
  if (!allowed.includes(field)) return { [allowed[0].replace(/^-/, '')]: -1 };
  return { [field]: descending ? -1 : 1 };
}

export function paginationMeta(total, page, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}
