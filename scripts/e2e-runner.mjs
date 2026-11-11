/**
 * Boots the API in production mode against a disposable database for E2E runs.
 * The client build in client/dist is served by the same origin, so the tests
 * exercise the real production bundle, service worker and API together.
 */
process.env.NODE_ENV = 'production';
process.env.E2E = 'true';
process.env.PORT = '4100';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/hamatrix_e2e?replicaSet=rs0';
process.env.JWT_ACCESS_SECRET = 'hamatrix-e2e-secret-0123456789abcdef0123456789';
process.env.CLIENT_ORIGIN = 'http://127.0.0.1:4100';
process.env.CORS_ORIGINS = 'http://127.0.0.1:4100';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = '123456';
process.env.LOG_LEVEL = 'warn';

import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
await mongoose.connection.db.dropDatabase();
await mongoose.disconnect();

await import('../src/server.js');
