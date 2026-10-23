import { describe, it, expect } from 'vitest';
import { formatBillNumber, formatPaymentRef, parseBillNumber } from '../numbering';

describe('Offline numbering generator', () => {
  const d = new Date(2026, 9, 23); // 2026-10-23

  it('formats bill number with branch, terminal, date, and 4-digit sequence', () => {
    expect(formatBillNumber('HQ', 'T01', d, 42)).toBe('HQ-T01-20261023-0042');
  });

  it('formats VietQR payment ref with uppercase alphanumeric characters', () => {
    const ref = formatPaymentRef('HQ', 'T01', 42);
    expect(ref).toBe('POSHQT010042');
    expect(ref.length).toBeLessThanOrEqual(20);
    expect(/^[A-Z0-9]+$/.test(ref)).toBe(true);
  });

  it('parses valid bill numbers back to constituent parts', () => {
    const parsed = parseBillNumber('HQ-T01-20261023-0042');
    expect(parsed).toEqual({ branchCode: 'HQ', terminalCode: 'T01', dateStr: '20261023', seq: 42 });
  });

  it('rejects invalid characters, negative sequences, or bad formats', () => {
    expect(() => formatPaymentRef('H-Q', 'T01', 1)).toThrow();
    expect(() => formatPaymentRef('HQ', 'T01', -1)).toThrow();
    expect(() => parseBillNumber('INVALID')).toThrow();
  });

  it('normalizes lowercase branch and terminal codes to uppercase', () => {
    expect(formatBillNumber('hq', 't01', d, 1)).toBe('HQ-T01-20261023-0001');
    expect(formatPaymentRef('hq', 't01', 1)).toBe('POSHQT010001');
  });

  it('formats sequences with 4 or more digits correctly', () => {
    expect(formatBillNumber('HQ', 'T01', d, 12345)).toBe('HQ-T01-20261023-12345');
    expect(formatPaymentRef('HQ', 'T01', 12345)).toBe('POSHQT0112345');
  });

  it('rejects invalid inputs in formatBillNumber', () => {
    expect(() => formatBillNumber('H-Q', 'T01', d, 1)).toThrow();
    expect(() => formatBillNumber('HQ', 'T 01', d, 1)).toThrow();
    expect(() => formatBillNumber('', 'T01', d, 1)).toThrow();
    expect(() => formatBillNumber('HQ', '', d, 1)).toThrow();
    expect(() => formatBillNumber('HQ', 'T01', d, -1)).toThrow();
    expect(() => formatBillNumber('HQ', 'T01', d, 1.5)).toThrow();
    expect(() => formatBillNumber('HQ', 'T01', new Date('invalid'), 1)).toThrow();
  });

  it('rejects payment references exceeding 20 characters', () => {
    // POS (3) + 10 + 10 + 4 = 27 > 20
    expect(() => formatPaymentRef('BRANCHTOOLONG', 'TERMINALTOOLONG', 1)).toThrow();
  });

  it('rejects invalid bill numbers during parsing', () => {
    expect(() => parseBillNumber('')).toThrow();
    expect(() => parseBillNumber('HQ-T01-202610-0001')).toThrow();
    expect(() => parseBillNumber('HQ_T01_20261023_0001')).toThrow();
    expect(() => parseBillNumber('HQ-T01-20261023-abc')).toThrow();
    expect(() => parseBillNumber('HQ-T01-20261023')).toThrow();
  });
});
