import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb } from '../src/db/connect.js';

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectDb(replSet.getUri('hamatrix_test'));
});

afterAll(async () => {
  try {
    await mongoose.connection.dropDatabase();
  } catch {
    // ignore teardown problems
  }
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});
