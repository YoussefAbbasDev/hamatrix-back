import { z } from 'zod';
import { INVOICE_TYPE_VALUES } from '../../utils/enums.js';
import { paginationSchema, dateRangeFields } from '../../utils/validation.js';

export const listInvoicesQuerySchema = paginationSchema
  .extend({
    type: z.enum(INVOICE_TYPE_VALUES).optional(),
    q: z.string().trim().max(80).optional(),
    ...dateRangeFields,
  })
  .strict();

export const listSalesQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().max(80).optional(),
    ...dateRangeFields,
  })
  .strict();

export const deleteInvoiceSchema = z
  .object({
    confirmInvoiceNumber: z.string().trim().min(1, 'رقم الفاتورة مطلوب للتأكيد').max(40),
  })
  .strict();
