import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { updateSettingsSchema } from './validation.js';
import { logoUpload } from './upload.js';
import * as controller from './controller.js';

export const settingsRouter = Router();

settingsRouter.get('/public', asyncHandler(controller.getPublicSettings));

settingsRouter.get('/', authenticate, asyncHandler(controller.getSettings));
settingsRouter.patch(
  '/',
  authenticate,
  validate({ body: updateSettingsSchema }),
  asyncHandler(controller.updateSettings),
);
settingsRouter.post('/logo', authenticate, logoUpload, asyncHandler(controller.uploadLogo));
settingsRouter.delete('/logo', authenticate, asyncHandler(controller.removeLogo));
