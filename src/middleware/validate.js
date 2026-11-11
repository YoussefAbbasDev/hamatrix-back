import { z } from 'zod';
import { errors } from '../utils/errors.js';

/**
 * Validates and replaces req.params / req.query / req.body with parsed values.
 * Unknown keys are rejected because every schema is strict.
 */
export const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) {
        req[key] = schemas[key].parse(req[key]);
      }
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        errors.validation(
          error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
    }
    next(error);
  }
};

export const idParamSchema = z
  .object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'معرّف غير صالح') })
  .strict();
