import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { loginLimiter } from '../../middleware/rateLimits.js';
import { errors } from '../../utils/errors.js';
import { loginSchema, credentialsSchema } from './validation.js';
import * as controller from './controller.js';

export const authRouter = Router();

const requireXhr = (req, res, next) => {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return next(errors.unauthenticated('طلب غير صالح'));
  }
  return next();
};

authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.post('/refresh', requireXhr, asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));

authRouter.get('/me', authenticate, asyncHandler(controller.me));
authRouter.patch(
  '/credentials',
  authenticate,
  validate({ body: credentialsSchema }),
  asyncHandler(controller.changeCredentials),
);
authRouter.post('/logout-all', authenticate, asyncHandler(controller.logoutAll));
authRouter.post('/socket-ticket', authenticate, asyncHandler(controller.socketTicket));
