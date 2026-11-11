import { sendOk, sendCreated } from '../../utils/response.js';
import * as service from './service.js';

export async function list(req, res) {
  const result = await service.listExpenses(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function get(req, res) {
  return sendOk(res, await service.getExpense(req.params.id));
}

export async function create(req, res) {
  return sendCreated(res, await service.createExpense(req.body, req.admin._id));
}

export async function update(req, res) {
  return sendOk(res, await service.updateExpense(req.params.id, req.body));
}

export async function remove(req, res) {
  await service.deleteExpense(req.params.id);
  return res.status(204).end();
}

export async function listCategories(req, res) {
  const categories = await service.listExpenseCategories({
    includeInactive: req.query.includeInactive === 'true',
  });
  return sendOk(res, { categories });
}

export async function createCategory(req, res) {
  return sendCreated(res, await service.createExpenseCategory(req.body));
}

export async function updateCategory(req, res) {
  return sendOk(res, await service.updateExpenseCategory(req.params.id, req.body));
}
