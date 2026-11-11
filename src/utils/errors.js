import { ERROR_CODES } from './errorCodes.js';

export class AppError extends Error {
  constructor(code, status, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

export const errors = {
  validation: (details) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'بيانات غير صحيحة', details),

  unauthenticated: (message = 'يجب تسجيل الدخول') =>
    new AppError(ERROR_CODES.UNAUTHENTICATED, 401, message),

  tokenExpired: () =>
    new AppError(ERROR_CODES.TOKEN_EXPIRED, 401, 'انتهت صلاحية الجلسة'),

  invalidCredentials: () =>
    new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'اسم المستخدم أو كلمة المرور غير صحيحة'),

  accountLocked: (until) =>
    new AppError(
      ERROR_CODES.ACCOUNT_LOCKED,
      423,
      'الحساب مقفل مؤقتًا بسبب محاولات دخول خاطئة',
      { lockedUntil: until },
    ),

  accountDisabled: () =>
    new AppError(ERROR_CODES.ACCOUNT_DISABLED, 403, 'الحساب معطل'),

  notFound: (entity = 'العنصر') =>
    new AppError(ERROR_CODES.NOT_FOUND, 404, `${entity} غير موجود`),

  conflict: (code, message, details) =>
    new AppError(code || ERROR_CODES.CONFLICT_STATE, 409, message, details),

  business: (code, message, details) => new AppError(code, 422, message, details),

  rateLimited: (message = 'محاولات كثيرة. حاول لاحقًا') =>
    new AppError(ERROR_CODES.RATE_LIMITED, 429, message),

  uploadInvalid: (message = 'ملف غير صالح') =>
    new AppError(ERROR_CODES.UPLOAD_INVALID, 400, message),

  internal: (message = 'حدث خطأ غير متوقع') =>
    new AppError(ERROR_CODES.INTERNAL_ERROR, 500, message),
};
