import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { errors } from '../../utils/errors.js';

const brandDir = path.join(env.uploadDirAbs, 'brand');
fs.mkdirSync(brandDir, { recursive: true });

const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);
const extensionFor = (mime) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, brandDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `logo-${unique}.${extensionFor(file.mimetype)}`);
  },
});

export const logoUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) {
      return cb(errors.uploadInvalid('الشعار يجب أن يكون PNG أو JPG أو WebP'));
    }
    return cb(null, true);
  },
}).single('logo');
