import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    logoUrl: { type: String, default: '/logo.png' },
    accentColor: { type: String, default: '#FF2E93' },
    accentColor2: { type: String, default: '#8B5CFF' },
    receiptHeader: { type: String, default: '', maxlength: 200 },
    receiptFooter: { type: String, default: '', maxlength: 200 },
  },
  { _id: false },
);

const localeSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'EGP', uppercase: true, minlength: 3, maxlength: 3 },
    currencyMinorUnits: { type: Number, default: 2, min: 0, max: 3 },
    timezone: { type: String, default: 'Africa/Cairo' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, enum: ['12h', '24h'], default: '24h' },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    defaultBillingMode: { type: String, enum: ['open', 'fixed'], default: 'open' },
    defaultDurationMinutes: { type: Number, default: 60, min: 5, max: 1440 },
    alertBeforeEndMinutes: { type: Number, default: 0, min: 0, max: 60 },
    allowPause: { type: Boolean, default: true },
    allowManualAmountEdit: { type: Boolean, default: true },
    maxDurationMinutes: { type: Number, default: 720, min: 5, max: 1440 },
  },
  { _id: false },
);

const inventorySchema = new mongoose.Schema(
  {
    lowStockNotifications: { type: Boolean, default: true },
    allowNegativeStock: { type: Boolean, default: false },
  },
  { _id: false },
);

const uiSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    reduceEffects: { type: Boolean, default: false },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    prefix: { type: String, default: 'INV', maxlength: 8 },
    storePhone: { type: String, default: '', maxlength: 40 },
    storeAddress: { type: String, default: '', maxlength: 200 },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'business' },
    brand: { type: brandSchema, required: true },
    locale: { type: localeSchema, required: true },
    session: { type: sessionSchema, required: true },
    inventory: { type: inventorySchema, required: true },
    ui: { type: uiSchema, required: true },
    invoice: { type: invoiceSchema, required: true },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const Settings = mongoose.model('Settings', settingsSchema);
