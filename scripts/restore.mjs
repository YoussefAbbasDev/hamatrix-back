/**
 * Restores a backup produced by scripts/backup.mjs.
 *
 * Collections present in the backup are emptied and refilled. Collections that
 * are not part of the backup are left untouched. Stop the API before restoring.
 *
 * Usage:
 *   npm run db:restore -- D:\backups\hamatrix-2026-11-11 --confirm
 *
 * The confirmation flag is mandatory because existing rows are replaced.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { env } from '../src/config/env.js';

const dirArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
// npm swallows its own `--yes` config flag, so `--confirm` is the safe spelling
// when the script runs through `npm run`.
const confirmed =
  process.argv.includes('--yes') || process.argv.includes('--confirm');

if (!dirArg) {
  console.error('Usage: npm run db:restore -- <backup-dir> --confirm');
  process.exit(1);
}

const dir = path.resolve(dirArg);
const manifestPath = path.join(dir, 'manifest.json');

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch {
  console.error(`No readable manifest.json in ${dir}`);
  process.exit(1);
}

if (manifest.format !== 'hamatrix-ejson-ndjson') {
  console.error('Unsupported backup format.');
  process.exit(1);
}

if (!confirmed) {
  console.error(
    `This replaces data in ${env.MONGODB_URI} with the backup from ${manifest.createdAt}.\n` +
      'Re-run with --yes to continue.',
  );
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.db;

console.log(`Restoring into ${db.databaseName} from ${dir}`);

for (const [name, expected] of Object.entries(manifest.collections)) {
  const file = path.join(dir, `${name}.jsonl`);
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    console.error(`Missing collection file: ${file}`);
    process.exit(1);
  }

  const docs = raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => EJSON.parse(line, { relaxed: false }));

  await db.collection(name).deleteMany({});

  for (let index = 0; index < docs.length; index += 500) {
    await db.collection(name).insertMany(docs.slice(index, index + 500));
  }

  console.log(`${name.padEnd(24)} ${docs.length}/${expected}`);
}

await mongoose.disconnect();
console.log('\nRestore complete. Restart the API so caches and indexes are rebuilt.');
