import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 120 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, required: true, maxlength: 40 },
    requestHash: { type: String, required: true, maxlength: 128 },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

idempotencyKeySchema.index({ user: 1, scope: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
