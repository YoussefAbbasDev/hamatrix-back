import { sendOk, sendCreated } from '../../utils/response.js';
import * as service from './service.js';

export async function list(req, res) {
  const result = await service.listDevices(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function get(req, res) {
  return sendOk(res, await service.getDevice(req.params.id));
}

export async function create(req, res) {
  return sendCreated(res, { device: await service.createDevice(req.body) });
}

export async function update(req, res) {
  return sendOk(res, {
    device: await service.updateDevice(req.params.id, req.body, req.admin._id, req),
  });
}

export async function remove(req, res) {
  await service.deleteDevice(req.params.id);
  return res.status(204).end();
}

export async function maintenanceStart(req, res) {
  return sendOk(res, {
    device: await service.startMaintenance(req.params.id, req.body, req.admin._id, req),
  });
}

export async function maintenanceComplete(req, res) {
  return sendOk(res, {
    device: await service.completeMaintenance(req.params.id, req.admin._id, req),
  });
}

export async function stats(req, res) {
  return sendOk(res, await service.deviceStats(req.params.id, req.query));
}

export async function sessions(req, res) {
  const result = await service.deviceSessions(req.params.id, req.query);
  return sendOk(res, result, { pagination: result.pagination });
}
