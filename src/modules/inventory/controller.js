import { sendOk, sendCreated, sendResult } from '../../utils/response.js';
import { runIdempotent } from '../../utils/idempotency.js';
import * as service from './service.js';

export async function listMovements(req, res) {
  const result = await service.listMovements(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function stockIn(req, res) {
  const result = await runIdempotent(req, 'inventory:stock-in', async () => ({
    status: 201,
    body: await service.stockIn(req.body, req.admin._id),
  }));
  return sendResult(res, result);
}

export async function adjust(req, res) {
  return sendCreated(res, { result: await service.adjustStock(req.body, req.admin._id) });
}

export async function summary(req, res) {
  return sendOk(res, await service.inventorySummary(req.query));
}

export async function valuation(req, res) {
  return sendOk(res, await service.inventoryValuation());
}
