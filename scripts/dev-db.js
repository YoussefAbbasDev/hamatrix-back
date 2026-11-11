/**
 * Local development database.
 *
 * Starts an embedded single-node MongoDB replica set on port 27017 and keeps
 * its data in ../../.data/mongo so the café data survives restarts.
 *
 * A replica set (not a standalone mongod) is required because every financial
 * operation in HAMATRIX runs inside a multi-document transaction.
 *
 * Usage: npm run db:dev
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const dbPath = path.join(repoRoot, '.data', 'mongo');

const PORT = Number(process.env.DEV_DB_PORT || 27017);
const REPL_SET = process.env.DEV_DB_REPLSET || 'rs0';
const HOST = '127.0.0.1';

const log = (message) => console.log(`[db:dev] ${message}`);

/**
 * mongodb-memory-server caches its downloaded mongod inside the nearest
 * node_modules/.cache. Because `npm run db:dev` executes from server/, that
 * resolves to server/node_modules/.cache, while npm installs the binary in the
 * workspace root. Passing the already downloaded binary as a system binary
 * keeps the dev database offline and instant, with no re-download.
 */
async function findCachedMongod() {
  const candidates = [
    path.join(repoRoot, 'node_modules', '.cache', 'mongodb-memory-server'),
    path.join(repoRoot, 'server', 'node_modules', '.cache', 'mongodb-memory-server'),
  ];

  for (const dir of candidates) {
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    const binary = entries
      .filter((name) => name.startsWith('mongod') && name.endsWith('.exe'))
      .sort()
      .pop();
    if (binary) return path.join(dir, binary);
  }

  return null;
}

let replSet = null;
let shuttingDown = false;

async function main() {
  await fs.mkdir(dbPath, { recursive: true });

  const systemBinary = await findCachedMongod();
  log(`starting mongod on ${HOST}:${PORT} (replica set "${REPL_SET}")`);
  log(`data directory: ${dbPath}`);
  log(
    systemBinary
      ? `binary: ${systemBinary}`
      : 'binary: not cached yet — mongodb-memory-server will download it once',
  );

  // Set the download directory before the package is loaded so npm workspaces
  // and plain installs share a single cache location.
  if (!process.env.MONGOMS_DOWNLOAD_DIR && !systemBinary) {
    process.env.MONGOMS_DOWNLOAD_DIR = path.join(
      repoRoot,
      'node_modules',
      '.cache',
      'mongodb-memory-server',
    );
  }

  const { MongoMemoryReplSet } = await import('mongodb-memory-server');

  replSet = await MongoMemoryReplSet.create({
    binary: systemBinary
      ? { systemBinary }
      : process.env.MONGOMS_VERSION
        ? { version: process.env.MONGOMS_VERSION }
        : undefined,
    replSet: {
      count: 1,
      name: REPL_SET,
      storageEngine: 'wiredTiger',
      configSettings: { electionTimeoutMillis: 1000 },
    },
    instanceOpts: [
      {
        // Passing ip here (instead of extra args) matters: the server already
        // emits --bind_ip, and a duplicate flag makes mongod exit with code 2.
        ip: HOST,
        port: PORT,
        dbPath,
        storageEngine: 'wiredTiger',
      },
    ],
  });

  const uri = `mongodb://${HOST}:${PORT}/hamatrix?replicaSet=${REPL_SET}`;

  log('database is ready');
  log('');
  log('MONGODB_URI=' + uri);
  log('');
  log('Keep this process running while you develop. Press Ctrl+C to stop.');

  const stop = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, stopping mongod (data is kept)`);
    try {
      // doCleanup:false keeps the custom dbPath intact for the next start.
      await replSet?.stop({ doCleanup: false });
    } catch (error) {
      log(`stop failed: ${error.message}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((error) => {
  console.error('[db:dev] failed to start:', error);
  process.exitCode = 1;
});
