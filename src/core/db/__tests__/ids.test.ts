import { describe, it, expect } from 'vitest';
import {
  areaDocId,
  bankAccountDocId,
  billDocId,
  branchDocId,
  categoryDocId,
  comboDocId,
  modifierGroupDocId,
  priceListDocId,
  productDocId,
  productBranchOverrideId,
  recordDocId,
  sessionDocId,
  sessionEventsDocId,
  tableDocId,
  typeDocId,
} from '../ids';

describe('id conventions', () => {
  it('builds branch document ids', () => {
    expect(branchDocId('hq')).toBe('branch:hq');
  });

  it('builds product document ids', () => {
    expect(productDocId('p001')).toBe('product:p001');
  });

  it('builds branch override ids scoped by branch first', () => {
    expect(productBranchOverrideId('p001', 'hq')).toBe('product_override:hq:p001');
  });

  it('builds type definition ids', () => {
    expect(typeDocId('product')).toBe('type:product');
  });

  it('rejects empty segments', () => {
    expect(() => branchDocId('')).toThrow(/branchId/i);
    expect(() => productDocId('')).toThrow(/productId/i);
    expect(() => typeDocId('')).toThrow(/typeKey/i);
  });

  it('rejects a type key containing a colon', () => {
    expect(() => typeDocId('a:b')).toThrow(/must not contain ":"/);
  });

  it('builds catalog document ids', () => {
    expect(categoryDocId('drinks')).toBe('category:drinks');
    expect(modifierGroupDocId('topping')).toBe('modifier_group:topping');
    expect(comboDocId('com-trua')).toBe('combo:com-trua');
    expect(priceListDocId('happy-hour')).toBe('price_list:happy-hour');
  });

  it('rejects empty or colon-bearing catalog id segments', () => {
    expect(() => categoryDocId('')).toThrow();
    expect(() => categoryDocId('a:b')).toThrow();
    expect(() => priceListDocId(' ')).toThrow();
  });
});

describe('recordDocId', () => {
  it('builds a record id from the type key and the record id', () => {
    expect(recordDocId('supplier', 's001')).toBe('supplier:s001');
  });

  it('rejects colons in either segment', () => {
    expect(() => recordDocId('a:b', 'x')).toThrow(/must not contain ":"/);
    expect(() => recordDocId('a', 'x:y')).toThrow(/must not contain ":"/);
  });
});

describe('M3 order ID helpers', () => {
  it('builds area, table, session, bill, and session_events IDs', () => {
    expect(areaDocId('hq', 'floor-1')).toBe('area:hq:floor-1');
    expect(tableDocId('hq', 't01')).toBe('table:hq:t01');
    expect(sessionDocId('hq', 'sess-123')).toBe('session:hq:sess-123');
    expect(billDocId('hq', 'bill-456')).toBe('bill:hq:bill-456');
    expect(sessionEventsDocId('hq', 'sess-123')).toBe('session_events:hq:sess-123');
    expect(bankAccountDocId('hq')).toBe('bank_account:hq');
  });

  it('rejects colons and empty segments in M3 IDs', () => {
    expect(() => areaDocId('hq', 'floor:1')).toThrow();
    expect(() => tableDocId('', 't01')).toThrow();
  });
});

