export const DEVICE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
});

export const DEVICE_STATUS_VALUES = Object.values(DEVICE_STATUS);

export const DEVICE_TYPES = Object.freeze(['PC', 'PS4', 'PS5', 'Xbox', 'Other']);

export const BILLING_MODE = Object.freeze({
  OPEN: 'open',
  FIXED: 'fixed',
});

export const BILLING_MODE_VALUES = Object.values(BILLING_MODE);

export const SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
});

export const SESSION_STATUS_VALUES = Object.values(SESSION_STATUS);

export const VISIT_STATUS = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
});

export const VISIT_STATUS_VALUES = Object.values(VISIT_STATUS);

export const VISIT_TYPE = Object.freeze({
  SESSION: 'session',
  QUICK_SALE: 'quick_sale',
});

export const VISIT_TYPE_VALUES = Object.values(VISIT_TYPE);

export const INVOICE_TYPE = Object.freeze({
  SESSION: 'session',
  QUICK_SALE: 'quick_sale',
});

export const INVOICE_TYPE_VALUES = Object.values(INVOICE_TYPE);

export const STOCK_MOVEMENT_TYPE = Object.freeze({
  INITIAL: 'initial',
  PURCHASE: 'purchase',
  SALE: 'sale',
  ADJUSTMENT: 'adjustment',
  DAMAGE: 'damage',
  WASTE: 'waste',
});

export const STOCK_MOVEMENT_VALUES = Object.values(STOCK_MOVEMENT_TYPE);

export const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
});

export const THEMES = Object.freeze(['dark', 'light']);
