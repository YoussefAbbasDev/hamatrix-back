import { sendOk, sendNoContent } from '../../utils/response.js';
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from '../../utils/cookies.js';
import * as authService from './service.js';

const context = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  req,
});

const stripRefresh = (payload) => {
  const { refreshToken, refreshExpiresAt, ...rest } = payload;
  return { payload: rest, refreshToken, refreshExpiresAt };
};

export async function login(req, res) {
  const result = await authService.login(req.body, context(req));
  const { payload, refreshToken, refreshExpiresAt } = stripRefresh(result);
  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  return sendOk(res, payload);
}

export async function refresh(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  const result = await authService.refresh(raw, context(req));
  const { payload, refreshToken, refreshExpiresAt } = stripRefresh(result);
  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  return sendOk(res, payload);
}

export async function logout(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(raw);
  clearRefreshCookie(res);
  return sendNoContent(res);
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.admin._id, req);
  clearRefreshCookie(res);
  return sendNoContent(res);
}

export async function me(req, res) {
  const user = await authService.getMe(req.admin._id);
  return sendOk(res, { user });
}

export async function changeCredentials(req, res) {
  const result = await authService.changeCredentials(req.admin._id, req.body, { req });
  clearRefreshCookie(res);
  return sendOk(res, result);
}

export async function socketTicket(req, res) {
  const ticket = authService.signSocketTicket(req.admin);
  return sendOk(res, { ticket, expiresIn: 60 });
}
