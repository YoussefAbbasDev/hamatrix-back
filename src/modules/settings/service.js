import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { audit } from '../audit/service.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { Settings } from './model.js';
import { emitEvent, SOCKET_EVENTS } from '../../sockets/events.js';

const SECTIONS = ['brand', 'locale', 'session', 'inventory', 'ui', 'invoice'];
const CACHE_TTL_MS = 30 * 1000;

let cache = null;
let cacheAt = 0;

function pickSections(source) {
  const result = {};
  for (const section of SECTIONS) {
    if (source[section]) result[section] = source[section];
  }
  return result;
}

async function loadFromDb() {
  let doc = await Settings.findById('business').lean();
  if (!doc) {
    await Settings.create({ _id: 'business', ...DEFAULT_SETTINGS });
    doc = await Settings.findById('business').lean();
  }
  return doc;
}

export async function getSettings({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  cache = await loadFromDb();
  cacheAt = Date.now();
  return cache;
}

export async function getPublicSettings() {
  const settings = await getSettings();
  return {
    brand: settings.brand,
    locale: settings.locale,
    ui: settings.ui,
    version: settings.version,
  };
}

export async function ensureSettings() {
  const existing = await Settings.findById('business');
  if (existing) return existing;
  return Settings.create({ _id: 'business', ...DEFAULT_SETTINGS });
}

export async function updateSettings(patch, actorId, req) {
  const current = await getSettings({ force: true });
  const set = {};
  for (const section of SECTIONS) {
    if (patch[section]) {
      set[section] = { ...current[section], ...patch[section] };
    }
  }

  const before = pickSections(current);
  const doc = await Settings.findByIdAndUpdate(
    'business',
    { $set: set, $inc: { version: 1 } },
    { new: true, runValidators: true },
  ).lean();

  cache = doc;
  cacheAt = Date.now();

  await audit({
    action: 'SETTINGS_UPDATED',
    entityType: 'Settings',
    entityId: 'business',
    actorId,
    before,
    after: pickSections(doc),
    req,
  });

  emitEvent(SOCKET_EVENTS.SETTINGS_UPDATED, { version: doc.version });
  return doc;
}

async function deleteUploadedAsset(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const relative = url.replace('/uploads/', '');
  const absolute = path.resolve(env.uploadDirAbs, relative);
  if (!absolute.startsWith(env.uploadDirAbs)) return;
  try {
    await fs.rm(absolute, { force: true });
  } catch (error) {
    logger.warn({ err: error, url }, 'Could not delete previous uploaded asset');
  }
}

export async function updateLogo(logoUrl, actorId, req) {
  const current = await getSettings({ force: true });
  const previous = current.brand?.logoUrl;
  const doc = await Settings.findByIdAndUpdate(
    'business',
    { $set: { 'brand.logoUrl': logoUrl }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  ).lean();

  cache = doc;
  cacheAt = Date.now();

  if (previous && previous !== logoUrl) await deleteUploadedAsset(previous);

  await audit({
    action: 'SETTINGS_LOGO_UPDATED',
    entityType: 'Settings',
    entityId: 'business',
    actorId,
    before: { logoUrl: previous },
    after: { logoUrl },
    req,
  });

  emitEvent(SOCKET_EVENTS.SETTINGS_UPDATED, { version: doc.version });
  return doc;
}

export async function resetLogo(actorId, req) {
  return updateLogo('/logo.png', actorId, req);
}
