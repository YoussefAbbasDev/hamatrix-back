import multer from 'multer';
import { errors } from '../../utils/errors.js';

const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * The image stays in memory and is stored in MongoDB as a data URL.
 *
 * Writing to `server/uploads` works locally but fails on read-only serverless
 * filesystems (Vercel returns EROFS), and files written there would disappear
 * with the next deployment anyway. A logo is small enough for a document.
 */
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) {
      return cb(errors.uploadInvalid('الشعار يجب أن يكون PNG أو JPG أو WebP'));
    }
    return cb(null, true);
  },
}).single('logo');
