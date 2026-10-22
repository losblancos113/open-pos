import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import { createOverrideDoc, overrideDocId, validateOverride } from '../override';

const NOW = '2026-10-22T09:00:00.000Z';

function ok() {
  return createOverrideDoc({ productId: 'product:pho-bo', branchId: 'hq', now: NOW });
}

describe('createOverrideDoc', () => {
  it('builds a branch override document', () => {
    const doc = ok();
    expect(doc._id).toBe('product_override:hq:pho-bo');
    expect(doc.docType).toBe('product_override');
    expect(doc.branchId).toBe('hq');
    expect(doc.productId).toBe('product:pho-bo');
    expect(doc.price).toBeNull();
    expect(doc.available).toBe(true);
    expect(doc.sortOrder).toBeNull();
    expect(validateOverride(doc)).toEqual([]);
  });

  it('never targets the global tier', () => {
    // Override ở tầng global là vô nghĩa và sẽ che mất lỗi lập trình.
    expect(() =>
      createOverrideDoc({ productId: 'product:pho-bo', branchId: GLOBAL_BRANCH_ID, now: NOW }),
    ).toThrow(/global/i);
  });

  it('takes a product document id and keeps the M0 id format', () => {
    // Helper M0 nhận segment trần và thứ tự tham số đọc ngược với chuỗi sinh ra —
    // test này khoá cả hai để một lần "sửa cho dễ đọc" không phá dữ liệu đã ghi.
    expect(overrideDocId('product:pho-bo', 'hq')).toBe('product_override:hq:pho-bo');
    expect(() => overrideDocId('pho-bo', 'hq')).toThrow(/product document id/i);
  });
});

describe('validateOverride', () => {
  it('rejects a negative price, a bad product reference and a fractional sortOrder', () => {
    expect(validateOverride({ ...ok(), price: money(-1, 'VND') })[0]?.code).toBe('invalid_price');
    expect(validateOverride({ ...ok(), productId: 'pho-bo' })[0]?.code).toBe('invalid_reference');
    expect(validateOverride({ ...ok(), sortOrder: 1.5 })[0]?.code).toBe('invalid_sort_order');
  });

  it('accepts a partial override: only availability, only price, only order', () => {
    expect(validateOverride({ ...ok(), available: false })).toEqual([]);
    expect(validateOverride({ ...ok(), price: money(69000, 'VND') })).toEqual([]);
    expect(validateOverride({ ...ok(), sortOrder: 3 })).toEqual([]);
  });
});
