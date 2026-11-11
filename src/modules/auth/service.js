import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '../../utils/errorCodes.js';
import { env } from '../../config/env.js';
import { errors } from '../../utils/errors.js';
import { audit } from '../audit/service.js';
import { User } from '../users/model.js';
import { AuthSession } from './session.model.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const refreshTtlMs = () => env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), ver: user.tokenVersion, typ: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: `${env.ACCESS_TOKEN_MINUTES}m` },
  );
}

export function signSocketTicket(user) {
  return jwt.sign(
    { sub: user._id.toString(), ver: user.tokenVersion, typ: 'socket' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '60s' },
  );
}

export function verifyToken(token, expectedType = 'access') {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (payload.typ !== expectedType) throw new Error('Invalid token type');
  return payload;
}

async function createRefreshSession(user, { ip, userAgent, familyId } = {}) {
  const raw = randomBytes(48).toString('base64url');
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  await AuthSession.create({
    user: user._id,
    jti,
    familyId: familyId || randomUUID(),
    tokenHash: sha256(raw),
    expiresAt,
    ip: ip || null,
    userAgent: userAgent || null,
  });
  return { raw, jti, expiresAt };
}

function tokenResponse(user, refresh) {
  return {
    accessToken: signAccessToken(user),
    expiresIn: env.ACCESS_TOKEN_MINUTES * 60,
    refreshToken: refresh.raw,
    refreshExpiresAt: refresh.expiresAt,
    user: user.toSafeJSON(),
  };
}

export async function login({ username, password }, { ip, userAgent, req } = {}) {
  const normalized = username.trim().toLowerCase();
  const user = await User.findOne({ username: normalized }).select('+passwordHash');

  if (!user) {
    await audit({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'User',
      after: { username: normalized, reason: 'unknown_user' },
      req,
    });
    throw errors.invalidCredentials();
  }

  if (user.status !== 'active') throw errors.accountDisabled();

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw errors.accountLocked(user.lockedUntil.toISOString());
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await user.save();
    await audit({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'User',
      entityId: user._id,
      after: { username: normalized, attempts: user.failedLoginCount },
      req,
    });
    throw errors.invalidCredentials();
  }

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await createRefreshSession(user, { ip, userAgent });
  await audit({
    action: 'AUTH_LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user._id,
    actorId: user._id,
    req,
  });

  return tokenResponse(user, refresh);
}

export async function refresh(rawToken, { ip, userAgent, req } = {}) {
  if (!rawToken) throw errors.unauthenticated('جلسة غير صالحة');

  const existing = await AuthSession.findOne({ tokenHash: sha256(rawToken) });
  if (!existing) throw errors.unauthenticated('جلسة غير صالحة');

  if (existing.revokedAt) {
    await AuthSession.updateMany(
      { familyId: existing.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    await audit({
      action: 'AUTH_REFRESH_REUSE',
      entityType: 'AuthSession',
      entityId: existing._id,
      actorId: existing.user,
      req,
    });
    throw errors.unauthenticated('تم إبطال الجلسة لأسباب أمنية');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw errors.unauthenticated('انتهت صلاحية الجلسة');
  }

  const user = await User.findById(existing.user);
  if (!user || user.status !== 'active') throw errors.unauthenticated('الحساب غير متاح');

  const claimed = await AuthSession.findOneAndUpdate(
    { _id: existing._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );
  if (!claimed) {
    await AuthSession.updateMany(
      { familyId: existing.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw errors.unauthenticated('تم إبطال الجلسة لأسباب أمنية');
  }

  const next = await createRefreshSession(user, {
    ip,
    userAgent,
    familyId: existing.familyId,
  });
  await AuthSession.updateOne(
    { _id: existing._id },
    { $set: { replacedByJti: next.jti } },
  );

  return tokenResponse(user, next);
}

export async function logout(rawToken) {
  if (!rawToken) return;
  await AuthSession.updateOne(
    { tokenHash: sha256(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function logoutAll(userId, req) {
  await Promise.all([
    User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
    AuthSession.updateMany(
      { user: userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ),
  ]);
  await audit({
    action: 'AUTH_LOGOUT_ALL',
    entityType: 'User',
    entityId: userId,
    actorId: userId,
    req,
  });
}

export async function changeCredentials(
  userId,
  { currentPassword, username, newPassword },
  { req } = {},
) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw errors.unauthenticated();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw errors.business(ERROR_CODES.INVALID_CREDENTIALS, 'كلمة المرور الحالية غير صحيحة');

  const before = { username: user.username };
  const updated = {};

  if (username && username.trim().toLowerCase() !== user.username) {
    const normalized = username.trim().toLowerCase();
    const exists = await User.findOne({ username: normalized, _id: { $ne: user._id } });
    if (exists) throw errors.conflict(ERROR_CODES.CONFLICT_STATE, 'اسم المستخدم مستخدم بالفعل');
    user.username = normalized;
    updated.username = normalized;
  }

  if (newPassword) {
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    updated.passwordChanged = true;
  }

  user.tokenVersion += 1;
  user.mustChangePassword = false;
  await user.save();

  await AuthSession.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  await audit({
    action: 'AUTH_CREDENTIALS_CHANGED',
    entityType: 'User',
    entityId: user._id,
    actorId: user._id,
    before,
    after: updated,
    req,
  });

  return { username: user.username };
}

export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw errors.unauthenticated();
  return user.toSafeJSON();
}
