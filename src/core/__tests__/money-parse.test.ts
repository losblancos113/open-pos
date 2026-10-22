import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money, currencyExponent } from '../money';
import { formatMoneyInput, parseMoneyInput } from '../money-parse';

describe('parseMoneyInput', () => {
  it('parses a whole VND amount', () => {
    expect(parseMoneyInput('65000', 'VND')).toEqual(money(65000, 'VND'));
  });

  it('parses a USD amount with two decimals', () => {
    expect(parseMoneyInput('12.34', 'USD')).toEqual(money(1234, 'USD'));
  });

  it('pads a short fraction', () => {
    expect(parseMoneyInput('12.5', 'USD')).toEqual(money(1250, 'USD'));
    expect(parseMoneyInput('12', 'USD')).toEqual(money(1200, 'USD'));
  });

  it('trims surrounding whitespace and accepts a leading plus', () => {
    expect(parseMoneyInput('  1500 ', 'VND')).toEqual(money(1500, 'VND'));
    expect(parseMoneyInput('+1500', 'VND')).toEqual(money(1500, 'VND'));
  });

  it('parses a negative amount', () => {
    expect(parseMoneyInput('-2500', 'VND')).toEqual(money(-2500, 'VND'));
  });

  it('rejects a fraction VND cannot represent', () => {
    // VND exponent 0 — "65000.5" phải nổ, không được làm tròn im lặng.
    expect(() => parseMoneyInput('65000.5', 'VND')).toThrow(/65000\.5/);
  });

  it('rejects thousands separators instead of misreading them', () => {
    expect(() => parseMoneyInput('65,000', 'VND')).toThrow(/65,000/);
  });

  it('rejects empty, malformed and multi-dot input', () => {
    for (const bad of ['', '   ', 'abc', '1.2.3', '.5', '1.', '1e3', '65 000']) {
      expect(() => parseMoneyInput(bad, 'VND')).toThrow();
    }
  });

  it('rejects an amount beyond the safe integer range', () => {
    expect(() => parseMoneyInput('9007199254740992', 'VND')).toThrow(/safe/i);
  });

  it('normalises negative zero', () => {
    expect(parseMoneyInput('-0', 'VND')).toEqual(money(0, 'VND'));
  });
});

describe('formatMoneyInput', () => {
  it('formats without grouping or currency symbol', () => {
    expect(formatMoneyInput(money(1500, 'VND'))).toBe('1500');
    expect(formatMoneyInput(money(1234, 'USD'))).toBe('12.34');
    expect(formatMoneyInput(money(1200, 'USD'))).toBe('12.00');
    expect(formatMoneyInput(money(-5, 'USD'))).toBe('-0.05');
  });

  it('round-trips every representable amount', () => {
    const currency = fc.constantFrom('VND' as const, 'USD' as const);
    const minor = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
    fc.assert(
      fc.property(currency, minor, (cur, value) => {
        const text = formatMoneyInput(money(value, cur));
        expect(parseMoneyInput(text, cur)).toEqual(money(value, cur));
        expect(text.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(currencyExponent(cur));
      }),
    );
  });
});
