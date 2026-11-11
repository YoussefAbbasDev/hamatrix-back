/**
 * Logical MongoDB backup for HAMATRIX.
 *
 * Writes one NDJSON file per collection using BSON EJSON so ObjectIds, dates
 * and decimals survive a round-trip. No mongodump install is required.
 *
 * Usage:
 *   npm run db:backup
 *   npm run db:backup -- --out D:\backups\hamatrix-2026-11-11
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { env } from '../src/config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/ — backups live next to the backend they belong to.
const serverRoot = path.resolve(here, '..');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : null;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(
  argValue('--out') || path.join(serverRoot, 'backups', `hamatrix-${stamp}`),
);

await fs.mkdir(outDir, { recursive: true });

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.db;

const collections = (
  await db.listCollections({}, { nameOnly: true }).toArray()
).filter((item) => !item.name.startsWith('system.'));

const manifest = {
  format: 'hamatrix-ejson-ndjson',
  version: 1,
  createdAt: new Date().toISOString(),
  database: db.databaseName,
  collections: {},
};

for (const { name } of collections) {
  const docs = await db.collection(name).find({}).toArray();
  const body = docs.map((doc) => EJSON.stringify(doc, { relaxed: false })).join('\n');
  await fs.writeFile(path.join(outDir, `${name}.jsonl`), body ? `${body}\n` : '', 'utf8');
  manifest.collections[name] = docs.length;
  console.log(`${name.padEnd(24)} ${docs.length}`);
}

await fs.writeFile(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

await mongoose.disconnect();
console.log(`\nBackup written to ${outDir}`);
