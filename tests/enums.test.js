import { describe, it, expect } from 'vitest';
import {
  DEVICE_STATUS_VALUES,
  SESSION_STATUS_VALUES,
  VISIT_STATUS_VALUES,
  VISIT_TYPE_VALUES,
  INVOICE_TYPE_VALUES,
  STOCK_MOVEMENT_VALUES,
} from '../src/utils/enums.js';

/**
 * These lists are persisted in MongoDB documents and echoed in API responses,
 * so their exact values are a wire contract. The client keeps its own copy in
 * client/src/lib/enums.js with the same assertions; if one side is renamed the
 * corresponding test fails.
 */
describe('server enums', () => {
  it.each([
    ['DEVICE_STATUS_VALUES', DEVICE_STATUS_VALUES, ['available', 'occupied', 'maintenance']],
    ['SESSION_STATUS_VALUES', SESSION_STATUS_VALUES, ['active', 'paused', 'ended']],
    ['VISIT_STATUS_VALUES', VISIT_STATUS_VALUES, ['open', 'closed']],
    ['VISIT_TYPE_VALUES', VISIT_TYPE_VALUES, ['session', 'quick_sale']],
    ['INVOICE_TYPE_VALUES', INVOICE_TYPE_VALUES, ['session', 'quick_sale']],
    [
      'STOCK_MOVEMENT_VALUES',
      STOCK_MOVEMENT_VALUES,
      ['initial', 'purchase', 'sale', 'adjustment', 'damage', 'waste'],
    ],
  ])('%s exposes its values', (_name, actual, expected) => {
    expect(actual).toEqual(expected);
  });
});
