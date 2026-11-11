import { sendOk } from '../../utils/response.js';
import * as service from './service.js';

export async function list(req, res) {
  const result = await service.listInvoices(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function listSales(req, res) {
  const result = await service.listInvoices({ ...req.query, type: 'quick_sale' });
  return sendOk(res, result, { pagination: result.pagination });
}

export async function get(req, res) {
  return sendOk(res, await service.getInvoice(req.params.id));
}

export async function byVisit(req, res) {
  return sendOk(res, await service.getInvoiceByVisit(req.params.visitId));
}

export async function remove(req, res) {
  await service.deleteInvoice(req.params.id, req.body);
  return res.status(204).end();
}
