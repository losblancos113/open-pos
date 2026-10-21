import { describe, it, expect } from 'vitest';
import { money, add, sub, mulInt, isZero, isNegative, format } from '../money';

describe('money()', () => {
  it('creates a money value from integer minor units', () => {
    expect(money(100_000, 'VND')).toEqual({ minor: 100_000, currency: 'VND' });
  });

  it('rejects non-integer minor units', () => {
    expect(() => money(100.5, 'VND')).toThrow(/integer/i);
  });

  it('rejects minor units beyond safe integer range', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'VND')).toThrow(/safe integer/i);
  });
});

describe('arithmetic', () => {
  it('adds two money values of the same currency', () => {
    expect(add(money(30_000, 'VND'), money(45_000, 'VND'))).toEqual(money(75_000, 'VND'));
  });

  it('throws when adding different currencies', () => {
    expect(() => add(money(30_000, 'VND'), money(500, 'USD'))).toThrow(/currency mismatch/i);
  });

  it('subtracts money', () => {
    expect(sub(money(75_000, 'VND'), money(25_000, 'VND'))).toEqual(money(50_000, 'VND'));
  });

  it('multiplies by an integer', () => {
    expect(mulInt(money(20_000, 'VND'), 3)).toEqual(money(60_000, 'VND'));
  });

  it('rejects non-integer multiplier', () => {
    expect(() => mulInt(money(20_000, 'VND'), 1.5)).toThrow(/integer/i);
  });
});

describe('predicates', () => {
  it('detects zero and negative', () => {
    expect(isZero(money(0, 'VND'))).toBe(true);
    expect(isZero(money(1, 'VND'))).toBe(false);
    expect(isNegative(money(-1, 'VND'))).toBe(true);
    expect(isNegative(money(0, 'VND'))).toBe(false);
  });
});

describe('format()', () => {
  // ICU note: vi-VN currency formatting separates the amount from the ₫ sign
  // with U+00A0 (NO-BREAK SPACE), not U+0020. Verified against the Node build's
  // ICU data (Node v24.18.1); the expectation reflects the real output, not a
  // regular space.
  it('formats VND with no decimal places and vi-VN grouping', () => {
    expect(format(money(100_000, 'VND'), 'vi-VN')).toBe('100.000\u00A0₫');
  });

  it('formats negative VND', () => {
    expect(format(money(-100_000, 'VND'), 'vi-VN')).toBe('-100.000\u00A0₫');
  });

  it('formats USD with two decimal places', () => {
    expect(format(money(123_456, 'USD'), 'en-US')).toBe('$1,234.56');
  });
});
