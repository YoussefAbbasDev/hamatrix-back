import { describe, expect, it } from 'vitest';
import { add, allocate, fromMinor, mulInt, mulRate, percent, sub, toMinor } from '../src/utils/money.js';

describe('money: parsing', () => {
  it('parses numbers and decimal strings into piastres', () => {
    expect(toMinor(30)).toBe(3000);
    expect(toMinor(30.5)).toBe(3050);
    expect(toMinor('30.50')).toBe(3050);
    expect(toMinor('0.05')).toBe(5);
    expect(toMinor(-12.25)).toBe(-1225);
  });

  it('formats piastres back to a decimal string', () => {
    expect(fromMinor(3050)).toBe('30.50');
    expect(fromMinor(5)).toBe('0.05');
  });

  it('rejects non-integer minor values in arithmetic', () => {
    expect(() => add(1.5, 2)).toThrow(TypeError);
    expect(() => sub(10, 0.5)).toThrow(TypeError);
    expect(() => mulInt(100, 1.5)).toThrow(TypeError);
  });
});

describe('money: billing rate', () => {
  it('charges 30 EGP/h for 83 minutes using round-half-up', () => {
    // 3000 * 83 / 60 = 4150 exactly
    expect(mulRate(3000, 83, 60)).toBe(4150);
  });

  it('rounds half up to the nearest piastre', () => {
    expect(mulRate(1, 1, 2)).toBe(1);
    expect(mulRate(3, 1, 2)).toBe(2);
    expect(mulRate(100, 1, 3)).toBe(33);
  });

  it('handles zero minutes', () => {
    expect(mulRate(3000, 0, 60)).toBe(0);
  });
});

describe('money: percentages', () => {
  it('applies percentages with integer math', () => {
    expect(percent(1999, 10)).toBe(200);
    expect(percent(1000, '12.5')).toBe(125);
  });
});

describe('money: allocation', () => {
  it('splits an amount without losing a piastre', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it('falls back to equal parts when weights are zero', () => {
    const parts = allocate(100, [0, 0, 0]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(100);
  });
});
