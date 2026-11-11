import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import {
  createDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
  maintenanceSchema,
  deviceSessionsQuerySchema,
  deviceStatsQuerySchema,
} from './validation.js';
import * as controller from './controller.js';

export const devicesRouter = Router();

devicesRouter.use(authenticate);

devicesRouter.get('/', validate({ query: listDevicesQuerySchema }), asyncHandler(controller.list));
devicesRouter.post('/', validate({ body: createDeviceSchema }), asyncHandler(controller.create));

devicesRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
devicesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateDeviceSchema }),
  asyncHandler(controller.update),
);
devicesRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

devicesRouter.post(
  '/:id/maintenance',
  validate({ params: idParamSchema, body: maintenanceSchema }),
  asyncHandler(controller.maintenanceStart),
);
devicesRouter.post(
  '/:id/maintenance/complete',
  validate({ params: idParamSchema }),
  asyncHandler(controller.maintenanceComplete),
);
devicesRouter.get(
  '/:id/stats',
  validate({ params: idParamSchema, query: deviceStatsQuerySchema }),
  asyncHandler(controller.stats),
);
devicesRouter.get(
  '/:id/sessions',
  validate({ params: idParamSchema, query: deviceSessionsQuerySchema }),
  asyncHandler(controller.sessions),
);
