import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import {
  createVisitSchema,
  updateVisitSchema,
  listVisitsQuerySchema,
  addVisitItemSchema,
  updateVisitItemSchema,
  visitItemParamsSchema,
  checkoutSchema,
  quickSaleSchema,
} from './validation.js';
import { startSessionSchema } from '../sessions/validation.js';
import { listSalesQuerySchema } from '../invoices/validation.js';
import * as controller from './controller.js';
import * as sessionController from '../sessions/controller.js';
import * as invoiceController from '../invoices/controller.js';

export const visitsRouter = Router();
visitsRouter.use(authenticate);

visitsRouter.get('/', validate({ query: listVisitsQuerySchema }), asyncHandler(controller.list));
visitsRouter.post('/', validate({ body: createVisitSchema }), asyncHandler(controller.create));

visitsRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
visitsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateVisitSchema }),
  asyncHandler(controller.update),
);
visitsRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

visitsRouter.post(
  '/:id/items',
  validate({ params: idParamSchema, body: addVisitItemSchema }),
  asyncHandler(controller.addItem),
);
visitsRouter.patch(
  '/:id/items/:itemId',
  validate({ params: visitItemParamsSchema, body: updateVisitItemSchema }),
  asyncHandler(controller.updateItem),
);
visitsRouter.delete(
  '/:id/items/:itemId',
  validate({ params: visitItemParamsSchema }),
  asyncHandler(controller.removeItem),
);

visitsRouter.post(
  '/:id/sessions',
  validate({ params: idParamSchema, body: startSessionSchema }),
  asyncHandler(sessionController.startForVisit),
);

visitsRouter.post(
  '/:id/checkout',
  validate({ params: idParamSchema, body: checkoutSchema }),
  asyncHandler(controller.checkout),
);

export const salesRouter = Router();
salesRouter.use(authenticate);
salesRouter.get(
  '/',
  validate({ query: listSalesQuerySchema }),
  asyncHandler(invoiceController.listSales),
);
salesRouter.post('/', validate({ body: quickSaleSchema }), asyncHandler(controller.quickSale));
