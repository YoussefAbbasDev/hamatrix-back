import mongoose from 'mongoose';
import { INVOICE_TYPE_VALUES, PAYMENT_METHOD } from '../../utils/enums.js';

const lineMetaSchema = new mongoose.Schema(
  {
    deviceName: { type: String, default: null },
    deviceCode: { type: String, default: null },
    minutes: { type: Number, default: null },
    ratePerHourMinor: { type: Number, default: null },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sku: { type: String, default: null },
    qty: { type: Number, default: null },
  },
  { _id: false },
);

const invoiceLineSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['time', 'product'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    description: { type: String, required: true, maxlength: 200 },
    qty: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
    costMinor: { type: Number, default: 0, min: 0 },
    meta: { type: lineMetaSchema, default: () => ({}) },
  },
  { _id: false },
);

const storeSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', required: true },
    type: { type: String, enum: INVOICE_TYPE_VALUES, required: true },
    playerName: { type: String, default: '', maxlength: 80 },
    lines: { type: [invoiceLineSchema], default: [] },
    subtotalMinor: { type: Number, required: true, min: 0 },
    adjustmentMinor: { type: Number, default: 0 },
    adjustmentNote: { type: String, default: '', maxlength: 200 },
    totalMinor: { type: Number, required: true, min: 0 },
    costTotalMinor: { type: Number, default: 0, min: 0 },
    issuedAt: { type: Date, required: true },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHOD), default: PAYMENT_METHOD.CASH },
    status: { type: String, enum: ['paid'], default: 'paid' },
    currency: { type: String, default: 'EGP', maxlength: 3 },
    storeSnapshot: { type: storeSnapshotSchema, default: () => ({}) },
    visitType: { type: String, default: null },
    openedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

invoiceSchema.index({ visit: 1 }, { unique: true });
invoiceSchema.index({ issuedAt: -1 });
invoiceSchema.index({ type: 1, issuedAt: -1 });
invoiceSchema.index({ playerName: 1 });

export const Invoice = mongoose.model('Invoice', invoiceSchema);
