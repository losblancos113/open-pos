import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import { createProductDoc, lowestVariantPrice, normalizeBarcode, validateProduct } from '../product';

function base() {
  return createProductDoc({
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    categoryId: 'category:main',
    now: '2026-10-22T09:00:00.000Z',
  });
}

describe('createProductDoc', () => {
  it('builds a global catalog document', () => {
    const doc = base();
    expect(doc._id).toBe('product:pho-bo');
    expect(doc.docType).toBe('catalog_product');
    expect(doc.branchId).toBe(GLOBAL_BRANCH_ID);
  });

  it('defaults variants, references and optional fields', () => {
    const doc = base();
    expect(doc.variants).toEqual([]);
    expect(doc.modifierGroupIds).toEqual([]);
    expect(doc.barcode).toBeNull();
    expect(doc.imageRef).toBeNull();
    expect(doc.sku).toBeNull();
    expect(doc.unit).toBeNull();
    expect(doc.sortOrder).toBe(0);
    expect(doc.isActive).toBe(true);
  });
});

describe('normalizeBarcode', () => {
  it('trims and treats blanks as absent', () => {
    expect(normalizeBarcode('  8935001 ')).toBe('8935001');
    expect(normalizeBarcode('   ')).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode(undefined)).toBeNull();
  });
});

describe('validateProduct', () => {
  it('accepts a plain product', () => {
    expect(validateProduct(base())).toEqual([]);
  });

  it('accepts variants with negative deltas when the total stays non-negative', () => {
    const doc = {
      ...base(),
      variants: [
        { id: 'size-m', name: { vi: 'Tô vừa', en: 'Medium' }, priceDelta: money(0, 'VND') },
        { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-10000, 'VND') },
      ],
    };
    expect(validateProduct(doc)).toEqual([]);
    expect(lowestVariantPrice(doc)).toEqual(money(55000, 'VND'));
  });

  it('rejects variants whose delta would make the price negative', () => {
    const doc = {
      ...base(),
      variants: [
        { id: 'size-xs', name: { vi: 'Cỡ thử', en: 'Taster' }, priceDelta: money(-70000, 'VND') },
      ],
    };
    const issues = validateProduct(doc);
    expect(issues[0]?.code).toBe('invalid_price');
    expect(issues[0]?.path).toBe('variants');
  });

  it('rejects duplicate variant ids', () => {
    const doc = {
      ...base(),
      variants: [
        { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
        { id: 'size-l', name: { vi: 'Lớn hơn', en: 'Bigger' }, priceDelta: money(12000, 'VND') },
      ],
    };
    expect(validateProduct(doc).some((entry) => entry.code === 'duplicate_variant_id')).toBe(true);
  });

  it('rejects a malformed reference or bad barcode', () => {
    expect(validateProduct({ ...base(), categoryId: 'drinks' })[0]?.code).toBe('invalid_reference');
    expect(validateProduct({ ...base(), modifierGroupIds: ['topping'] })[0]?.code).toBe('invalid_reference');
    expect(validateProduct({ ...base(), barcode: '893 5001' }).some((p) => p.code === 'invalid_barcode')).toBe(true);
  });

  it('rejects a non-integer sortOrder and a missing name', () => {
    expect(validateProduct({ ...base(), sortOrder: 1.5 })[0]?.code).toBe('invalid_sort_order');
    expect(validateProduct({ ...base(), name: { vi: '', en: 'x' } })[0]?.code).toBe('missing_name');
  });
});
