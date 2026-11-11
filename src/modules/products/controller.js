import { sendOk, sendCreated } from '../../utils/response.js';
import * as service from './service.js';

export async function list(req, res) {
  const result = await service.listProducts(req.query);
  return sendOk(res, result, { pagination: result.pagination });
}

export async function get(req, res) {
  return sendOk(res, await service.getProduct(req.params.id));
}

export async function create(req, res) {
  return sendCreated(res, { product: await service.createProduct(req.body, req.admin._id) });
}

export async function update(req, res) {
  return sendOk(res, {
    product: await service.updateProduct(req.params.id, req.body, req.admin._id, req),
  });
}

export async function remove(req, res) {
  await service.deleteProduct(req.params.id);
  return res.status(204).end();
}

export async function lowStock(req, res) {
  return sendOk(res, { products: await service.lowStockProducts() });
}

export async function listCategories(req, res) {
  const categories = await service.listCategories({
    includeInactive: req.query.includeInactive === 'true',
  });
  return sendOk(res, { categories });
}

export async function createCategory(req, res) {
  return sendCreated(res, { category: await service.createCategory(req.body) });
}

export async function updateCategory(req, res) {
  return sendOk(res, { category: await service.updateCategory(req.params.id, req.body) });
}

export async function removeCategory(req, res) {
  await service.deleteCategory(req.params.id);
  return res.status(204).end();
}
