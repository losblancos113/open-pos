import { describe, it, expect } from 'vitest';
import { branchDocId, productDocId, productBranchOverrideId, typeDocId } from '../ids';

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
});
