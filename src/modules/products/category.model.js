import mongoose from 'mongoose';

const productCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, unique: true, sparse: true, trim: true, maxlength: 80 },
    color: { type: String, default: '#8B5CFF', maxlength: 20 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export const ProductCategory = mongoose.model('ProductCategory', productCategorySchema);
