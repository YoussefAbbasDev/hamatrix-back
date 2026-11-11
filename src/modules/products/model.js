import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, index: true },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 40 },
    barcode: { type: String, default: null, trim: true, maxlength: 64 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', default: null },
    unit: { type: String, default: 'قطعة', trim: true, maxlength: 20 },
    sellingPriceMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'سعر البيع يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    purchasePriceMinor: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'سعر الشراء يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    stockQty: {
      type: Number,
      default: 0,
      validate: { validator: Number.isSafeInteger, message: 'الكمية يجب أن تكون عددًا صحيحًا' },
    },
    minStockQty: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'حد التنبيه يجب أن يكون عددًا صحيحًا' },
    },
    description: { type: String, default: '', maxlength: 300 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isActive: 1, stockQty: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });

export const Product = mongoose.model('Product', productSchema);
