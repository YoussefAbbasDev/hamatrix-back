import { sendOk, sendCreated, sendResult } from '../../utils/response.js';
import { runIdempotent } from '../../utils/idempotency.js';
import * as service from './service.js';

export async function list(req, res) {
  const result = await service.listVisits(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function create(req, res) {
  return sendCreated(res, await service.createVisit(req.body));
}

export async function get(req, res) {
  return sendOk(res, await service.getVisitDetail(req.params.id));
}

export async function update(req, res) {
  return sendOk(res, await service.updateVisit(req.params.id, req.body));
}

export async function remove(req, res) {
  await service.abandonVisit(req.params.id);
  return res.status(204).end();
}

export async function addItem(req, res) {
  return sendOk(res, await service.addVisitItem(req.params.id, req.body, req.admin._id));
}

export async function updateItem(req, res) {
  return sendOk(
    res,
    await service.updateVisitItem(req.params.id, req.params.itemId, req.body, req.admin._id),
  );
}

export async function removeItem(req, res) {
  return sendOk(res, await service.removeVisitItem(req.params.id, req.params.itemId));
}

export async function checkout(req, res) {
  const result = await runIdempotent(req, 'visit:checkout', async () => ({
    status: 201,
    body: await service.checkoutVisit(req.params.id, req.body, req.admin._id),
  }));
  return sendResult(res, result);
}

export async function quickSale(req, res) {
  const result = await runIdempotent(req, 'sale:quick', async () => ({
    status: 201,
    body: await service.quickSale(req.body, req.admin._id),
  }));
  return sendResult(res, result);
}
