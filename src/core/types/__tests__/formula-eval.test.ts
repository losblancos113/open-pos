import { describe, it, expect } from 'vitest';
import { parseFormula } from '../formula';
import { evaluateFormula, formulaValueOf, type FormulaValue } from '../formula-eval';
import { rat } from '../rational';
import { money } from '../../money';

const num = (n: number, d = 1): FormulaValue => ({ kind: 'number', value: rat(n, d) });
const usd = (minor: number): FormulaValue => ({ kind: 'money', money: money(minor, 'USD') });
const vnd = (minor: number): FormulaValue => ({ kind: 'money', money: money(minor, 'VND') });
const bool = (value: boolean): FormulaValue => ({ kind: 'boolean', value });

function evalSrc(src: string, values: Record<string, FormulaValue>): FormulaValue {
  return evaluateFormula(parseFormula(src), values);
}

describe('evaluateFormula — arithmetic', () => {
  it('evaluates the spec example exactly', () => {
    expect(evalSrc('price * 0.6', { price: vnd(100000) })).toEqual(vnd(60000));
  });

  it('keeps full precision through a chain and rounds once', () => {
    // 100000 * 0.6 / 3 = 20000, không bị lỗi làm tròn trung gian
    expect(evalSrc('price * 0.6 / 3', { price: vnd(100000) })).toEqual(vnd(20000));
  });

  it('multiplies money by money only through a scalar', () => {
    expect(evalSrc('price * qty', { price: vnd(69000), qty: num(3) })).toEqual(vnd(207000));
  });

  it('rejects adding two different currencies', () => {
    expect(() => evalSrc('a + b', { a: vnd(100), b: usd(100) })).toThrow(/currency/i);
  });

  it('rejects arithmetic between money and boolean', () => {
    expect(() => evalSrc('a + b', { a: vnd(100), b: bool(true) })).toThrow(/type/i);
  });

  it('rounds money results half away from zero', () => {
    expect(evalSrc('price * 0.5', { price: vnd(1) })).toEqual(vnd(1));
    expect(evalSrc('price * 0.5', { price: vnd(-1) })).toEqual(vnd(-1));
  });

  it('does exact rational arithmetic on plain numbers', () => {
    expect(evalSrc('0.1 + 0.2', {})).toEqual(num(3, 10));
    expect(evalSrc('a / 3 * 3', { a: num(1) })).toEqual(num(1));
  });

  it('supports unary minus and remainder', () => {
    expect(evalSrc('-a', { a: num(5) })).toEqual(num(-5));
    expect(evalSrc('a % 3', { a: num(7) })).toEqual(num(1));
  });

  it('rejects remainder on money', () => {
    expect(() => evalSrc('a % 2', { a: vnd(7) })).toThrow(/type|remainder/i);
  });

  it('divides money by money into a number', () => {
    expect(evalSrc('a / b', { a: vnd(300), b: vnd(100) })).toEqual(num(3));
  });

  it('rejects dividing money by money across currencies', () => {
    expect(() => evalSrc('a / b', { a: vnd(300), b: usd(100) })).toThrow(/currency/i);
  });
});

describe('evaluateFormula — comparisons and logic', () => {
  it('compares money and numbers', () => {
    expect(evalSrc('price >= 100', { price: vnd(100) })).toEqual(bool(true));
    expect(evalSrc('price > 100', { price: vnd(100) })).toEqual(bool(false));
  });

  it('evaluates logical operators', () => {
    expect(evalSrc('a && b', { a: bool(true), b: bool(false) })).toEqual(bool(false));
    expect(evalSrc('a || b', { a: bool(true), b: bool(false) })).toEqual(bool(true));
    expect(evalSrc('!a', { a: bool(false) })).toEqual(bool(true));
  });

  it('rejects logical operators on non-booleans', () => {
    expect(() => evalSrc('a && b', { a: num(1), b: bool(true) })).toThrow(/boolean/i);
    expect(() => evalSrc('!a', { a: num(1) })).toThrow(/boolean/i);
  });

  it('rejects comparing different types', () => {
    expect(() => evalSrc('a < b', { a: vnd(100), b: bool(true) })).toThrow(/type/i);
    expect(() => evalSrc('a == b', { a: vnd(100), b: usd(100) })).toThrow(/currency/i);
  });

  it('treats == and != as numeric equality', () => {
    expect(evalSrc('a == 2', { a: num(2) })).toEqual(bool(true));
    expect(evalSrc('a != 2', { a: num(2) })).toEqual(bool(false));
  });
});

describe('evaluateFormula — functions', () => {
  it('sum() adds every argument', () => {
    expect(evalSrc('sum(1, 2, 3)', {})).toEqual(num(6));
  });

  it('sum() over money keeps the currency', () => {
    expect(evalSrc('sum(a, b)', { a: vnd(100), b: vnd(250) })).toEqual(vnd(350));
  });

  it('sum() rejects mixed currencies', () => {
    expect(() => evalSrc('sum(a, b)', { a: vnd(100), b: usd(250) })).toThrow(/currency/i);
  });

  it('avg() divides by the argument count', () => {
    expect(evalSrc('avg(1, 2, 4)', {})).toEqual(num(7, 3));
  });

  it('avg() over money rounds once', () => {
    expect(evalSrc('avg(a, b)', { a: vnd(100), b: vnd(201) })).toEqual(vnd(151));
  });

  it('round() rounds to the given number of digits', () => {
    expect(evalSrc('round(1.2345, 2)', {})).toEqual(num(123, 100));
    expect(evalSrc('round(1.235, 2)', {})).toEqual(num(124, 100));
  });

  it('returns canonical reduced rationals', () => {
    // 1.24 là 31/25, không phải 124/100 — Rational luôn tối giản.
    expect(evalSrc('round(1.235, 2)', {})).toEqual({ kind: 'number', value: { n: 31, d: 25 } });
  });

  it('round() defaults to zero digits', () => {
    expect(evalSrc('round(1.5)', {})).toEqual(num(2));
  });

  it('round() rounds half away from zero for negatives', () => {
    expect(evalSrc('round(-1.5)', {})).toEqual(num(-2));
  });

  it('round() works on money and keeps the currency', () => {
    expect(evalSrc('round(a * 0.5)', { a: vnd(1) })).toEqual(vnd(1));
  });

  it('round() rejects a non-integer digit count', () => {
    expect(() => evalSrc('round(1.234, 1.5)', {})).toThrow(/digit|integer/i);
  });

  it('if() picks a branch', () => {
    expect(evalSrc('if(1 < 2, 10, 20)', {})).toEqual(num(10));
    expect(evalSrc('if(1 > 2, 10, 20)', {})).toEqual(num(20));
  });

  it('if() requires a boolean condition', () => {
    expect(() => evalSrc('if(1, 10, 20)', {})).toThrow(/boolean/i);
  });

  it('if() only evaluates the branch it picks', () => {
    // Nhánh không chọn chứa phép chia cho 0 — nếu tính cả hai nhánh thì test này fail.
    expect(evalSrc('if(1 < 2, 10, 1 / 0)', {})).toEqual(num(10));
  });
});

describe('evaluateFormula — errors', () => {
  it('rejects a field that is not in the value map', () => {
    expect(() => evalSrc('ghost + 1', {})).toThrow(/unknown field/i);
  });

  it('rejects division by zero', () => {
    expect(() => evalSrc('a / b', { a: num(1), b: num(0) })).toThrow(/zero/i);
  });

  it('rejects money times money', () => {
    expect(() => evalSrc('a * b', { a: vnd(100), b: vnd(100) })).toThrow(/type/i);
  });
});

describe('formulaValueOf', () => {
  it('converts a money field value', () => {
    expect(
      formulaValueOf(
        { key: 'p', dataType: 'money', label: { vi: 'P', en: 'P' }, required: false },
        money(100, 'VND'),
      ),
    ).toEqual({ kind: 'money', money: money(100, 'VND') });
  });

  it('converts a decimal field value using its scale', () => {
    expect(
      formulaValueOf(
        { key: 'd', dataType: 'decimal', scale: 2, label: { vi: 'D', en: 'D' }, required: false },
        1234,
      ),
    ).toEqual({ kind: 'number', value: { n: 617, d: 50 } });
  });

  it('converts a number field value', () => {
    expect(
      formulaValueOf(
        { key: 'n', dataType: 'number', label: { vi: 'N', en: 'N' }, required: false },
        7,
      ),
    ).toEqual({ kind: 'number', value: { n: 7, d: 1 } });
  });

  it('converts a boolean field value', () => {
    expect(
      formulaValueOf(
        { key: 'b', dataType: 'boolean', label: { vi: 'B', en: 'B' }, required: false },
        true,
      ),
    ).toEqual({ kind: 'boolean', value: true });
  });

  it('returns null for a type that cannot participate in formulas', () => {
    expect(
      formulaValueOf(
        { key: 'n', dataType: 'textarea', label: { vi: 'N', en: 'N' }, required: false },
        'abc',
      ),
    ).toBeNull();
  });

  it('returns null for a missing value', () => {
    expect(
      formulaValueOf({ key: 'n', dataType: 'number', label: { vi: 'N', en: 'N' }, required: false }, null),
    ).toBeNull();
  });
});
