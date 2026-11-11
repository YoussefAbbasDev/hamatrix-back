import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `npm run test` executes from server/, so mongodb-memory-server would look for
// its cached mongod inside server/node_modules/.cache and re-download ~600 MB.
// Pointing it at the workspace cache keeps tests offline and instant.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: '123456',
      MONGOMS_DOWNLOAD_DIR: path.join(
        repoRoot,
        'node_modules',
        '.cache',
        'mongodb-memory-server',
      ),
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
