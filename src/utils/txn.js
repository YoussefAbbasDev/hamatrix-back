import mongoose from 'mongoose';

/**
 * Runs `fn(session)` inside a MongoDB multi-document transaction.
 * Mongoose retries transient transaction errors automatically.
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
