import { describe, it, expect } from 'vitest';
import {
  rat,
  ratFromDecimal,
  ratAdd,
  ratSub,
  ratMul,
  ratDiv,
  ratCmp,
  ratIsInteger,
  ratToNumber,
  ratRound,
} from '../rational';

describe('rat', () => {
  it('reduces to lowest terms with a positive denominator', () => {
    expect(rat(6, 8)).toEqual({ n: 3, d: 4 });
    expect(rat(1, -2)).toEqual({ n: -1, d: 2 });
    expect(rat(0, 5)).toEqual({ n: 0, d: 1 });
  });

  it('defaults the denominator to one', () => {
    expect(rat(7)).toEqual({ n: 7, d: 1 });
  });

  it('rejects a zero denominator', () => {
    expect(() => rat(1, 0)).toThrow(/denominator/i);
  });

  it('rejects a non-integer numerator or denominator', () => {
    expect(() => rat(0.5, 1)).toThrow(/integer/i);
    expect(() => rat(1, 2.5)).toThrow(/integer/i);
  });
});

describe('ratFromDecimal', () => {
  it('parses decimal literals exactly', () => {
    expect(ratFromDecimal('0.6')).toEqual({ n: 3, d: 5 });
    expect(ratFromDecimal('1.25')).toEqual({ n: 5, d: 4 });
    expect(ratFromDecimal('3')).toEqual({ n: 3, d: 1 });
    expect(ratFromDecimal('-0.1')).toEqual({ n: -1, d: 10 });
  });

  it('does not go through floating point', () => {
    // 0.1 + 0.2 ở float là 0.30000000000000004; hữu tỉ phải cộng chính xác.
    expect(ratAdd(ratFromDecimal('0.1'), ratFromDecimal('0.2'))).toEqual(rat(3, 10));
  });

  it('rejects malformed literals', () => {
    expect(() => ratFromDecimal('1.2.3')).toThrow(/number/i);
    expect(() => ratFromDecimal('abc')).toThrow(/number/i);
    expect(() => ratFromDecimal('')).toThrow(/number/i);
    expect(() => ratFromDecimal('1.')).toThrow(/number/i);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(ratAdd(rat(1, 3), rat(1, 6))).toEqual({ n: 1, d: 2 });
    expect(ratSub(rat(1, 2), rat(1, 3))).toEqual({ n: 1, d: 6 });
  });

  it('multiplies and divides exactly', () => {
    expect(ratMul(rat(2, 3), rat(3, 4))).toEqual({ n: 1, d: 2 });
    expect(ratDiv(rat(1, 2), rat(1, 4))).toEqual({ n: 2, d: 1 });
  });

  it('keeps the sign in the numerator', () => {
    expect(ratAdd(rat(1, 3), rat(-1, 2))).toEqual({ n: -1, d: 6 });
    expect(ratMul(rat(-2, 3), rat(3, 4))).toEqual({ n: -1, d: 2 });
  });

  it('throws on division by zero', () => {
    expect(() => ratDiv(rat(1, 2), rat(0))).toThrow(/zero/i);
  });

  it('compares', () => {
    expect(ratCmp(rat(1, 3), rat(1, 2))).toBe(-1);
    expect(ratCmp(rat(1, 2), rat(1, 2))).toBe(0);
    expect(ratCmp(rat(2, 3), rat(1, 2))).toBe(1);
  });

  it('compares negative values', () => {
    expect(ratCmp(rat(-1, 2), rat(-1, 3))).toBe(-1);
  });

  it('throws instead of silently overflowing the safe integer range', () => {
    expect(() =>
      ratMul(rat(Number.MAX_SAFE_INTEGER), rat(Number.MAX_SAFE_INTEGER)),
    ).toThrow(/safe integer/i);
  });
});

describe('ratRound', () => {
  it('rounds half away from zero to an integer', () => {
    expect(ratRound(rat(5, 10))).toBe(1);
    expect(ratRound(rat(3, 10))).toBe(0);
    expect(ratRound(rat(15, 10))).toBe(2);
    expect(ratRound(rat(-5, 10))).toBe(-1);
    expect(ratRound(rat(-15, 10))).toBe(-2);
  });

  it('returns the integer unchanged when already whole', () => {
    expect(ratRound(rat(4))).toBe(4);
    expect(ratIsInteger(rat(4))).toBe(true);
    expect(ratIsInteger(rat(4, 3))).toBe(false);
  });
});

describe('ratToNumber', () => {
  it('converts to a JavaScript number', () => {
    expect(ratToNumber(rat(1, 2))).toBe(0.5);
    expect(ratToNumber(rat(-3, 4))).toBe(-0.75);
  });
});
