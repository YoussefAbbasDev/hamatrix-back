import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  deleteExpenseSchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from './validation.js';
import * as controller from './controller.js';

export const expensesRouter = Router();
expensesRouter.use(authenticate);

expensesRouter.get('/', validate({ query: listExpensesQuerySchema }), asyncHandler(controller.list));
expensesRouter.post('/', validate({ body: createExpenseSchema }), asyncHandler(controller.create));
expensesRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
expensesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateExpenseSchema }),
  asyncHandler(controller.update),
);
expensesRouter.delete(
  '/:id',
  validate({ params: idParamSchema, body: deleteExpenseSchema }),
  asyncHandler(controller.remove),
);

export const expenseCategoriesRouter = Router();
expenseCategoriesRouter.use(authenticate);

expenseCategoriesRouter.get('/', asyncHandler(controller.listCategories));
expenseCategoriesRouter.post(
  '/',
  validate({ body: createExpenseCategorySchema }),
  asyncHandler(controller.createCategory),
);
expenseCategoriesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateExpenseCategorySchema }),
  asyncHandler(controller.updateCategory),
);
