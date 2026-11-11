import mongoose from 'mongoose';
import { VISIT_STATUS, VISIT_STATUS_VALUES, VISIT_TYPE, VISIT_TYPE_VALUES } from '../../utils/enums.js';

const visitItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    nameSnapshot: { type: String, required: true, maxlength: 120 },
    skuSnapshot: { type: String, default: '', maxlength: 40 },
    qty: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPriceMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'السعر يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    purchasePriceMinor: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'التكلفة يجب أن تكون عددًا صحيحًا بالقروش' },
    },
    lineTotalMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'الإجمالي يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    addedAt: { type: Date, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
);

const visitSchema = new mongoose.Schema(
  {
    visitNumber: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    type: {
      type: String,
      enum: VISIT_TYPE_VALUES,
      default: VISIT_TYPE.SESSION,
    },
    playerName: { type: String, default: '', trim: true, maxlength: 80 },
    status: {
      type: String,
      enum: VISIT_STATUS_VALUES,
      default: VISIT_STATUS.OPEN,
      index: true,
    },
    openedAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    items: { type: [visitItemSchema], default: [] },
    sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
    itemsSubtotalMinor: { type: Number, default: 0, min: 0 },
    timeSubtotalMinor: { type: Number, default: 0, min: 0 },
    computedTotalMinor: { type: Number, default: 0, min: 0 },
    adjustmentMinor: { type: Number, default: 0 },
    adjustmentNote: { type: String, default: '', maxlength: 200 },
    totalMinor: { type: Number, default: 0, min: 0 },
    costTotalMinor: { type: Number, default: 0, min: 0 },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

visitSchema.index({ status: 1, openedAt: -1 });
visitSchema.index({ openedAt: -1 });
// One invoice per closed visit. Open visits store `invoice: null`, so the index
// must be partial on the ObjectId type — `sparse` alone would let every null
// collide and block every second open visit.
visitSchema.index(
  { invoice: 1 },
  { unique: true, partialFilterExpression: { invoice: { $type: 'objectId' } } },
);
visitSchema.index({ playerName: 1 });
visitSchema.index({ 'items.product': 1, status: 1 });

export const Visit = mongoose.model('Visit', visitSchema);
