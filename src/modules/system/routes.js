import { readFileSync } from 'node:fs';
import { Router } from 'express';
import mongoose from 'mongoose';
import { sendOk } from '../../utils/response.js';

const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

export const systemRouter = Router();

systemRouter.get('/health', async (req, res) => {
  const state = mongoose.connection.readyState;
  let replicaSet = false;
  let dbName = null;

  if (state === 1) {
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      replicaSet = Boolean(hello.setName);
      dbName = mongoose.connection.name;
    } catch {
      replicaSet = false;
    }
  }

  return sendOk(res, {
    status: state === 1 ? 'up' : 'down',
    db: {
      connected: state === 1,
      replicaSet,
      name: dbName,
    },
    uptimeSeconds: Math.round(process.uptime()),
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
  });
});

systemRouter.get('/time', (req, res) => sendOk(res, { serverTime: new Date().toISOString() }));
