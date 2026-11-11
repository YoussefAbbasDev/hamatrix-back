import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import {
  createSessionSchema,
  pauseSessionSchema,
  endSessionSchema,
  extendSessionSchema,
  listActiveSessionsQuerySchema,
} from './validation.js';
import * as controller from './controller.js';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

sessionsRouter.get(
  '/active',
  validate({ query: listActiveSessionsQuerySchema }),
  asyncHandler(controller.active),
);
sessionsRouter.post('/', validate({ body: createSessionSchema }), asyncHandler(controller.start));

sessionsRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
sessionsRouter.post(
  '/:id/pause',
  validate({ params: idParamSchema, body: pauseSessionSchema }),
  asyncHandler(controller.pause),
);
sessionsRouter.post(
  '/:id/resume',
  validate({ params: idParamSchema }),
  asyncHandler(controller.resume),
);
sessionsRouter.post(
  '/:id/extend',
  validate({ params: idParamSchema, body: extendSessionSchema }),
  asyncHandler(controller.extend),
);
sessionsRouter.post(
  '/:id/end',
  validate({ params: idParamSchema, body: endSessionSchema }),
  asyncHandler(controller.end),
);
