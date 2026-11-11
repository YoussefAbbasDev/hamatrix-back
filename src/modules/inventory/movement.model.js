import mongoose from 'mongoose';
import { STOCK_MOVEMENT_VALUES } from '../../utils/enums.js';

const referenceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['visit', 'manual', 'product'], default: 'manual' },
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    number: { type: String, default: null, maxlength: 40 },
  },
  { _id: false },
);

const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: { type: String, default: '' },
      sku: { type: String, default: '' },
    },
    type: { type: String, enum: STOCK_MOVEMENT_VALUES, required: true },
    qtyDelta: { type: Number, required: true, validate: (v) => Number.isSafeInteger(v) && v !== 0 },
    qtyBefore: { type: Number, required: true },
    qtyAfter: { type: Number, required: true },
    unitCostMinor: { type: Number, default: 0, min: 0 },
    valueDeltaMinor: { type: Number, default: 0 },
    supplierName: { type: String, default: '', maxlength: 120 },
    reference: { type: referenceSchema, default: () => ({}) },
    note: { type: String, default: '', maxlength: 300 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });
stockMovementSchema.index({ 'reference.id': 1 });
stockMovementSchema.index({ createdAt: -1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
