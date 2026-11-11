import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import {
  dashboardChartsQuerySchema,
  summaryQuerySchema,
  recordsQuerySchema,
  revenueDailyQuerySchema,
  devicesReportQuerySchema,
  productsReportQuerySchema,
  inventoryReportQuerySchema,
  exportQuerySchema,
} from './validation.js';
import * as controller from './controller.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/', asyncHandler(controller.dashboard));
dashboardRouter.get(
  '/charts',
  validate({ query: dashboardChartsQuerySchema }),
  asyncHandler(controller.charts),
);

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get(
  '/summary',
  validate({ query: summaryQuerySchema }),
  asyncHandler(controller.summary),
);
reportsRouter.get(
  '/records',
  validate({ query: recordsQuerySchema }),
  asyncHandler(controller.records),
);
reportsRouter.get(
  '/revenue/daily',
  validate({ query: revenueDailyQuerySchema }),
  asyncHandler(controller.revenue),
);
reportsRouter.get(
  '/devices',
  validate({ query: devicesReportQuerySchema }),
  asyncHandler(controller.devices),
);
reportsRouter.get(
  '/products',
  validate({ query: productsReportQuerySchema }),
  asyncHandler(controller.products),
);
reportsRouter.get(
  '/inventory',
  validate({ query: inventoryReportQuerySchema }),
  asyncHandler(controller.inventory),
);
reportsRouter.get(
  '/export',
  validate({ query: exportQuerySchema }),
  asyncHandler(controller.exportReport),
);
