import { describe, it, expect } from 'vitest';
import { branchDocId, productDocId, productBranchOverrideId } from '../ids';

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

  it('rejects empty segments', () => {
    expect(() => branchDocId('')).toThrow(/branchId/i);
    expect(() => productDocId('')).toThrow(/productId/i);
  });
});
