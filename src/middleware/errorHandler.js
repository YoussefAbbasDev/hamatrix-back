import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { ERROR_CODES } from '../utils/errorCodes.js';
import { isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export function notFound(req, res, next) {
  next(new AppError(ERROR_CODES.NOT_FOUND, 404, 'المسار غير موجود'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = ERROR_CODES.INTERNAL_ERROR;
  let message = 'حدث خطأ غير متوقع';
  let details;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    status = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'بيانات غير صحيحة';
    details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof multer.MulterError) {
    status = 400;
    code = ERROR_CODES.UPLOAD_INVALID;
    message =
      error.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف أكبر من الحد المسموح' : 'تعذر رفع الملف';
  } else if (error?.name === 'ValidationError' && error instanceof mongoose.Error) {
    status = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'بيانات غير صحيحة';
    details = Object.values(error.errors).map((item) => ({
      path: item.path,
      message: item.message,
    }));
  } else if (error?.name === 'CastError') {
    status = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'معرّف غير صالح';
  } else if (error?.code === 11000) {
    status = 409;
    code = ERROR_CODES.CONFLICT_STATE;
    message = 'القيمة مستخدمة بالفعل';
    details = error.keyValue ? { field: Object.keys(error.keyValue)[0] } : undefined;
  }

  if (status >= 500) {
    logger.error({
      err: error,
      requestId: res.locals.requestId,
      method: req.method,
      url: req.originalUrl,
    });
  }

  res.status(status).json({
    error: {
      code,
      message: isProd && status >= 500 ? 'حدث خطأ غير متوقع' : message,
      details,
      requestId: res.locals.requestId,
    },
  });
}
