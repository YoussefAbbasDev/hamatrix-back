import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import {
  stockInSchema,
  adjustmentSchema,
  listMovementsQuerySchema,
  summaryQuerySchema,
} from './validation.js';
import * as controller from './controller.js';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

inventoryRouter.get(
  '/movements',
  validate({ query: listMovementsQuerySchema }),
  asyncHandler(controller.listMovements),
);
inventoryRouter.post(
  '/stock-in',
  validate({ body: stockInSchema }),
  asyncHandler(controller.stockIn),
);
inventoryRouter.post(
  '/adjustments',
  validate({ body: adjustmentSchema }),
  asyncHandler(controller.adjust),
);
inventoryRouter.get(
  '/summary',
  validate({ query: summaryQuerySchema }),
  asyncHandler(controller.summary),
);
inventoryRouter.get('/valuation', asyncHandler(controller.valuation));
