export const DEFAULT_SETTINGS = Object.freeze({
  brand: {
    name: 'HAMATRIX',
    logoUrl: '/logo.png',
    accentColor: '#FF2E93',
    accentColor2: '#8B5CFF',
    receiptHeader: '',
    receiptFooter: 'شكرًا لزيارتكم',
  },
  locale: {
    currency: 'EGP',
    currencyMinorUnits: 2,
    timezone: 'Africa/Cairo',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
  },
  session: {
    defaultBillingMode: 'open',
    defaultDurationMinutes: 60,
    alertBeforeEndMinutes: 0,
    allowPause: true,
    allowManualAmountEdit: true,
    maxDurationMinutes: 720,
  },
  inventory: {
    lowStockNotifications: true,
    allowNegativeStock: false,
  },
  ui: {
    theme: 'dark',
    reduceEffects: false,
  },
  invoice: {
    prefix: 'INV',
    storePhone: '',
    storeAddress: '',
  },
});
