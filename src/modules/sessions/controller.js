import { sendOk, sendCreated } from '../../utils/response.js';
import * as service from './service.js';

export async function start(req, res) {
  const result = await service.startSession(req.body, req.admin._id);
  return sendCreated(res, result);
}

export async function startForVisit(req, res) {
  const result = await service.startSession(
    { ...req.body, visitId: req.params.id },
    req.admin._id,
  );
  return sendCreated(res, result);
}

export async function pause(req, res) {
  return sendOk(res, await service.pauseSession(req.params.id, req.body, req.admin._id));
}

export async function resume(req, res) {
  return sendOk(res, await service.resumeSession(req.params.id));
}

export async function extend(req, res) {
  return sendOk(res, await service.extendSession(req.params.id, req.body));
}

export async function end(req, res) {
  return sendOk(res, await service.endSession(req.params.id, req.body));
}

export async function active(req, res) {
  const result = await service.listActiveSessions(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function get(req, res) {
  return sendOk(res, await service.getSessionDetail(req.params.id));
}
