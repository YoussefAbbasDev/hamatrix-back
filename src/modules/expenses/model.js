import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'المبلغ يجب أن يكون عددًا صحيحًا بالقروش' },
    },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', default: null },
    categoryNameSnapshot: { type: String, default: '', maxlength: 60 },
    expenseDate: { type: Date, required: true },
    note: { type: String, default: '', maxlength: 300 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1, expenseDate: -1 });

export const Expense = mongoose.model('Expense', expenseSchema);
