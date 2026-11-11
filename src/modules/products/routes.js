import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate, idParamSchema } from '../../middleware/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from './validation.js';
import * as controller from './controller.js';

export const productsRouter = Router();
productsRouter.use(authenticate);

productsRouter.get(
  '/',
  validate({ query: listProductsQuerySchema }),
  asyncHandler(controller.list),
);
productsRouter.get('/low-stock', asyncHandler(controller.lowStock));
productsRouter.post(
  '/',
  validate({ body: createProductSchema }),
  asyncHandler(controller.create),
);
productsRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.get));
productsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateProductSchema }),
  asyncHandler(controller.update),
);
productsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
);

export const productCategoriesRouter = Router();
productCategoriesRouter.use(authenticate);

productCategoriesRouter.get('/', asyncHandler(controller.listCategories));
productCategoriesRouter.post(
  '/',
  validate({ body: createCategorySchema }),
  asyncHandler(controller.createCategory),
);
productCategoriesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCategorySchema }),
  asyncHandler(controller.updateCategory),
);
productCategoriesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(controller.removeCategory),
);
