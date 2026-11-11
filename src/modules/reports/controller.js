import { sendOk } from '../../utils/response.js';
import * as service from './service.js';

function sendCsv(res, { filename, csv }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
}

export async function dashboard(req, res) {
  return sendOk(res, await service.dashboard());
}

export async function charts(req, res) {
  return sendOk(res, await service.dashboardCharts(req.query));
}

export async function summary(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('summary', req.query));
  }
  return sendOk(res, await service.summary(req.query));
}

export async function records(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('records', req.query));
  }
  return sendOk(res, await service.records(req.query));
}

export async function revenue(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('revenue', req.query));
  }
  return sendOk(res, await service.revenueDaily(req.query));
}

export async function devices(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('devices', req.query));
  }
  return sendOk(res, await service.devicesReport(req.query));
}

export async function products(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('products', req.query));
  }
  return sendOk(res, await service.productsReport(req.query));
}

export async function inventory(req, res) {
  if (req.query.export === 'csv') {
    return sendCsv(res, await service.exportReport('inventory', req.query));
  }
  return sendOk(res, await service.inventoryReport());
}

export async function exportReport(req, res) {
  const { report, ...query } = req.query;
  return sendCsv(res, await service.exportReport(report, query));
}
