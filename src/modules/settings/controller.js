import { sendOk } from '../../utils/response.js';
import { errors } from '../../utils/errors.js';
import * as settingsService from './service.js';

export async function getSettings(req, res) {
  const settings = await settingsService.getSettings();
  return sendOk(res, { settings });
}

export async function getPublicSettings(req, res) {
  const settings = await settingsService.getPublicSettings();
  return sendOk(res, { settings });
}

export async function updateSettings(req, res) {
  const settings = await settingsService.updateSettings(req.body, req.admin._id, req);
  return sendOk(res, { settings });
}

export async function uploadLogo(req, res) {
  if (!req.file) throw errors.validation([{ path: 'logo', message: 'اختر صورة الشعار' }]);
  const logoUrl = `/uploads/brand/${req.file.filename}`;
  const settings = await settingsService.updateLogo(logoUrl, req.admin._id, req);
  return sendOk(res, { settings, logoUrl });
}

export async function removeLogo(req, res) {
  const settings = await settingsService.resetLogo(req.admin._id, req);
  return sendOk(res, { settings });
}
