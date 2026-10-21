import { describe, it, expect } from 'vitest';
import { parseFormula } from '../formula';

describe('parseFormula', () => {
  it('parses a money multiplication from the spec example', () => {
    const { ast, dependencies } = parseFormula('price * 0.6');
    expect(ast).toEqual({
      kind: 'binary',
      op: '*',
      left: { kind: 'field', key: 'price' },
      right: { kind: 'number', value: { n: 3, d: 5 } },
    });
    expect(dependencies).toEqual(['price']);
  });

  it('respects operator precedence', () => {
    const { ast } = parseFormula('a + b * c');
    expect(ast).toEqual({
      kind: 'binary',
      op: '+',
      left: { kind: 'field', key: 'a' },
      right: {
        kind: 'binary',
        op: '*',
        left: { kind: 'field', key: 'b' },
        right: { kind: 'field', key: 'c' },
      },
    });
  });

  it('honours parentheses', () => {
    const { ast } = parseFormula('(a + b) * c');
    expect(ast).toMatchObject({ kind: 'binary', op: '*', left: { kind: 'binary', op: '+' } });
  });

  it('parses comparisons and logical operators', () => {
    expect(parseFormula('a >= 10 && b != 0').ast).toMatchObject({ kind: 'logical', op: '&&' });
    expect(parseFormula('a < b').ast).toMatchObject({ kind: 'compare', op: '<' });
  });

  it('parses calls and collects dependencies from arguments', () => {
    const { ast, dependencies } = parseFormula('sum(price, tax, discount)');
    expect(ast).toMatchObject({ kind: 'call', name: 'sum' });
    expect([...dependencies].sort()).toEqual(['discount', 'price', 'tax']);
  });

  it('parses the spec whitelist of functions only', () => {
    expect(() => parseFormula('sum(1, 2)')).not.toThrow();
    expect(() => parseFormula('avg(1, 2)')).not.toThrow();
    expect(() => parseFormula('round(1.5)')).not.toThrow();
    expect(() => parseFormula('if(1, 2, 3)')).not.toThrow();
    expect(() => parseFormula('eval("1+1")')).toThrow(/unknown function/i);
    expect(() => parseFormula('max(1, 2)')).toThrow(/unknown function/i);
  });

  it('parses nested calls', () => {
    const { dependencies } = parseFormula('round(price * 0.6, 2)');
    expect(dependencies).toEqual(['price']);
  });

  it('reports arity errors', () => {
    expect(() => parseFormula('if(1, 2)')).toThrow(/expects/i);
    expect(() => parseFormula('round()')).toThrow(/expects/i);
    expect(() => parseFormula('sum()')).toThrow(/expects/i);
    expect(() => parseFormula('round(1, 2, 3)')).toThrow(/expects/i);
  });

  it('rejects syntax errors', () => {
    expect(() => parseFormula('a +')).toThrow(/syntax/i);
    expect(() => parseFormula('(a + b')).toThrow(/syntax/i);
    expect(() => parseFormula('a b')).toThrow(/syntax/i);
    expect(() => parseFormula('')).toThrow(/syntax/i);
    expect(() => parseFormula('a = 1')).toThrow(/syntax/i);
    expect(() => parseFormula('a < b < c')).toThrow(/syntax/i);
    expect(() => parseFormula('1 + "text"')).toThrow(/syntax/i);
  });

  it('reports the position of a syntax error', () => {
    expect(() => parseFormula('a + ')).toThrow(/position/i);
  });

  it('collects each dependency once, in order of first appearance', () => {
    expect(parseFormula('a + a * b').dependencies).toEqual(['a', 'b']);
  });

  it('exposes the source it parsed', () => {
    expect(parseFormula('a + 1').source).toBe('a + 1');
  });

  it('treats an identifier as a field reference, never a global', () => {
    // Không có `eval` / `new Function`: identifier chỉ có thể là field, không bao giờ là global.
    const scope = globalThis as unknown as Record<string, unknown>;
    scope.secret = 42;
    try {
      expect(() => parseFormula('secret')).not.toThrow();
      expect(parseFormula('secret').ast).toEqual({ kind: 'field', key: 'secret' });
    } finally {
      delete scope.secret;
    }
  });
});

describe('FormulaError', () => {
  it('carries a machine-readable code', () => {
    const cases: [string, string][] = [
      ['a +', 'syntax'],
      ['max(1)', 'unknown_function'],
      ['if(1, 2)', 'arity'],
    ];

    for (const [source, code] of cases) {
      try {
        parseFormula(source);
        throw new Error(`expected parseFormula(${JSON.stringify(source)}) to throw`);
      } catch (error) {
        expect((error as { code?: string }).code).toBe(code);
      }
    }
  });
});
