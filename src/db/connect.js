import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20,
  });

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const setName = hello.setName ?? null;

  if (!setName) {
    await mongoose.disconnect();
    throw new Error(
      'MongoDB must run as a replica set (transactions are required). ' +
        'Use `npm run db:dev` or docker-compose.yml. See DEPLOYMENT.md.',
    );
  }

  logger.info(
    { database: mongoose.connection.name, replicaSet: setName },
    'MongoDB connected',
  );

  return { replicaSet: true, setName };
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
