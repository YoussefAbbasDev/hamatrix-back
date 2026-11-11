import { z } from 'zod';

export const loginSchema = z
  .object({
    username: z.string().trim().min(3).max(32),
    password: z.string().min(1).max(128),
  })
  .strict();

export const credentialsSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    username: z.string().trim().min(3).max(32).optional(),
    newPassword: z.string().min(6).max(128).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.username || data.newPassword), {
    message: 'أدخل اسم مستخدم جديد أو كلمة مرور جديدة',
    path: ['newPassword'],
  });
