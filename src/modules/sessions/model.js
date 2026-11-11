import mongoose from 'mongoose';
import { BILLING_MODE, BILLING_MODE_VALUES, SESSION_STATUS, SESSION_STATUS_VALUES } from '../../utils/enums.js';

const segmentSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, default: null },
  },
  { _id: false },
);

const pausedSegmentSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, default: null },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const deviceSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    code: { type: String, default: '' },
    type: { type: String, default: '' },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    sessionNumber: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true, index: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
    deviceSnapshot: { type: deviceSnapshotSchema, default: () => ({}) },
    pricingOptionKey: { type: String, default: null, maxlength: 32 },
    pricingOptionName: { type: String, default: null, maxlength: 40 },
    ratePerHourMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'السعر يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    billingMode: {
      type: String,
      enum: BILLING_MODE_VALUES,
      default: BILLING_MODE.OPEN,
    },
    targetActiveMinutes: { type: Number, default: null, min: 1, max: 1440 },
    startedAt: { type: Date, required: true },
    expectedEndAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: SESSION_STATUS_VALUES,
      default: SESSION_STATUS.ACTIVE,
    },
    activeSegments: { type: [segmentSchema], default: [] },
    pausedSegments: { type: [pausedSegmentSchema], default: [] },
    activeSeconds: { type: Number, default: 0, min: 0 },
    pausedSeconds: { type: Number, default: 0, min: 0 },
    billableMinutes: { type: Number, default: 0, min: 0 },
    timeChargeMinor: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'المبلغ يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    overtimeSeconds: { type: Number, default: 0, min: 0 },
    endReason: { type: String, default: '', maxlength: 200 },
    notes: { type: String, default: '', maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

// BR-01: a device may hold at most one running (active/paused) session.
sessionSchema.index(
  { device: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PAUSED] } },
  },
);
sessionSchema.index({ status: 1, startedAt: -1 });
sessionSchema.index({ startedAt: -1 });

export const Session = mongoose.model('Session', sessionSchema);
