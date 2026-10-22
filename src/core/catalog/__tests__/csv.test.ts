import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CSV_BOM, formatCsv, formatCsvCell, parseCsv } from '../csv';

describe('formatCsvCell', () => {
  it('leaves a plain cell alone', () => {
    expect(formatCsvCell('Phở bò')).toBe('Phở bò');
  });

  it('quotes commas, quotes, newlines and edge spaces', () => {
    expect(formatCsvCell('Phở bò, tái')).toBe('"Phở bò, tái"');
    expect(formatCsvCell('Loại "đặc biệt"')).toBe('"Loại ""đặc biệt"""');
    expect(formatCsvCell('hai\ndòng')).toBe('"hai\ndòng"');
    expect(formatCsvCell(' leading')).toBe('" leading"');
  });
});

describe('formatCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    const text = formatCsv([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).toBe(`${CSV_BOM}a,b\r\nc,d\r\n`);
  });
});

describe('parseCsv', () => {
  it('reads back what formatCsv wrote, BOM and all', () => {
    const rows = [
      ['_id', 'name_vi'],
      ['product:pho-bo', 'Phở bò, tái'],
    ];
    expect(parseCsv(formatCsv(rows))).toEqual(rows);
  });

  it('accepts LF-only input and a missing final newline', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps an embedded newline inside a quoted cell', () => {
    expect(parseCsv('a,"hai\ndòng"\n')).toEqual([['a', 'hai\ndòng']]);
  });

  it('is empty for empty input and skips the trailing blank line', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
  });

  it('throws on an unterminated quoted cell', () => {
    expect(() => parseCsv('a,"b')).toThrow(/quote/i);
  });

  it('round-trips arbitrary tables', () => {
    const cell = fc.string();
    const table = fc.array(fc.array(cell, { minLength: 1 }), { maxLength: 6 });
    fc.assert(
      fc.property(table, (rows) => {
        expect(parseCsv(formatCsv(rows))).toEqual(rows);
      }),
    );
  });
});
