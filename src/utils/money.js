/**
 * Money is always stored and manipulated as integer minor units (piastres).
 * No floating point arithmetic is allowed on money values.
 */

const assertMinor = (value, name = 'amountMinor') => {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer minor amount, received: ${value}`);
  }
  return value;
};

export const toMinor = (value, minorUnits = 2) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Invalid money value');
    return Math.round(value * 10 ** minorUnits);
  }
  const raw = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new TypeError(`Invalid money string: ${value}`);
  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2];
  const fraction = (match[3] || '').padEnd(minorUnits, '0').slice(0, minorUnits);
  const result = Number(whole) * 10 ** minorUnits + Number(fraction || 0);
  if (!Number.isSafeInteger(result)) throw new TypeError('Money value out of safe range');
  return sign * result;
};

export const fromMinor = (minor, minorUnits = 2) => {
  assertMinor(minor);
  return (minor / 10 ** minorUnits).toFixed(minorUnits);
};

export const add = (a, b) => assertMinor(assertMinor(a) + assertMinor(b));
export const sub = (a, b) => assertMinor(assertMinor(a) - assertMinor(b));

export const mulInt = (amountMinor, factor) => {
  assertMinor(amountMinor);
  if (!Number.isSafeInteger(factor)) throw new TypeError('factor must be an integer');
  return assertMinor(amountMinor * factor);
};

const roundHalfUpBig = (numerator, denominator) => {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
};

/** amountMinor * numerator / denominator, rounded half-up to a whole minor unit. */
export const mulRate = (amountMinor, numerator, denominator = 1) => {
  assertMinor(amountMinor);
  const num = BigInt(Math.trunc(numerator));
  const den = BigInt(Math.trunc(denominator));
  if (den === 0n) throw new TypeError('denominator must not be zero');
  return assertMinor(Number(roundHalfUpBig(BigInt(amountMinor) * num, den)));
};

/** Percent as a decimal string ("12.5") or number, applied with integer math. */
export const percent = (amountMinor, percentValue) => {
  assertMinor(amountMinor);
  const raw = String(percentValue).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(raw);
  if (!match) throw new TypeError(`Invalid percentage: ${percentValue}`);
  const fraction = match[3] || '';
  const numerator = BigInt(`${match[1]}${match[2]}${fraction}`);
  const denominator = 100n * 10n ** BigInt(fraction.length);
  return assertMinor(Number(roundHalfUpBig(BigInt(amountMinor) * numerator, denominator)));
};

/**
 * Split `totalMinor` across weights so the parts sum exactly to the total.
 * Uses the largest remainder method (stable, deterministic).
 */
export const allocate = (totalMinor, weights) => {
  assertMinor(totalMinor);
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new TypeError('weights must be a non-empty array');
  }
  const sign = totalMinor < 0 ? -1 : 1;
  const absolute = Math.abs(totalMinor);
  const safeWeights = weights.map((w) => {
    const n = Number(w);
    if (!Number.isFinite(n) || n < 0) throw new TypeError('weights must be non-negative numbers');
    return n;
  });
  const weightSum = safeWeights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) {
    const base = Math.floor(absolute / weights.length);
    const result = new Array(weights.length).fill(base);
    result[0] += absolute - base * weights.length;
    return result.map((v) => v * sign);
  }
  const parts = safeWeights.map((w) => Math.floor((absolute * w) / weightSum));
  let remainder = absolute - parts.reduce((sum, p) => sum + p, 0);
  const order = safeWeights
    .map((w, index) => ({
      index,
      fraction: (absolute * w) / weightSum - parts[index],
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i += 1) {
    parts[order[i % order.length].index] += 1;
  }
  return parts.map((v) => v * sign);
};

export const format = (minor, { locale = 'ar-EG', currency = 'EGP', minorUnits = 2 } = {}) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(minor / 10 ** minorUnits);

export const money = {
  toMinor,
  fromMinor,
  add,
  sub,
  mulInt,
  mulRate,
  percent,
  allocate,
  format,
};

export default money;
