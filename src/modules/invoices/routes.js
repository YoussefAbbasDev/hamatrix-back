import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import { objectIdSchema } from '../../utils/validation.js';
import { listInvoicesQuerySchema, deleteInvoiceSchema } from './validation.js';
import * as controller from './controller.js';

const visitIdParamsSchema = z.object({ visitId: objectIdSchema }).strict();

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

invoicesRouter.get('/', validate({ query: listInvoicesQuerySchema }), asyncHandler(controller.list));
invoicesRouter.get(
  '/by-visit/:visitId',
  validate({ params: visitIdParamsSchema }),
  asyncHandler(controller.byVisit),
);
invoicesRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
invoicesRouter.delete(
  '/:id',
  validate({ params: idParamSchema, body: deleteInvoiceSchema }),
  asyncHandler(controller.remove),
);
