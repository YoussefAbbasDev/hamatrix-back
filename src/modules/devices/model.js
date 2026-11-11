import mongoose from 'mongoose';
import { DEVICE_STATUS, DEVICE_STATUS_VALUES } from '../../utils/enums.js';

const pricingOptionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 32,
    },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    pricePerHourMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'السعر يجب أن يكون عددًا صحيحًا بالقروش' },
    },
  },
  { _id: false },
);

const maintenanceEntrySchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    type: { type: String, trim: true, default: 'PC', maxlength: 32 },
    hourlyPriceMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'السعر يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    pricingOptions: { type: [pricingOptionSchema], default: [] },
    description: { type: String, default: '', maxlength: 300 },
    status: {
      type: String,
      enum: DEVICE_STATUS_VALUES,
      default: DEVICE_STATUS.AVAILABLE,
      index: true,
    },
    currentSession: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    isActive: { type: Boolean, default: true },
    maintenanceLog: { type: [maintenanceEntrySchema], default: [] },
    lastMaintenanceAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

deviceSchema.index({ type: 1, status: 1 });
deviceSchema.index({ isActive: 1, status: 1 });
deviceSchema.index({ name: 1 });
deviceSchema.index({ isDeleted: 1, status: 1 });

export const Device = mongoose.model('Device', deviceSchema);
