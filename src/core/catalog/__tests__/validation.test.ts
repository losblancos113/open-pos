import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import {
  assertNoIssues,
  issue,
  validateLocalizedName,
  validateMoneyValue,
  validateReferenceValue,
} from '../validation';

describe('validateLocalizedName', () => {
  it('accepts a bilingual name', () => {
    expect(validateLocalizedName('name', { vi: 'Phở bò', en: 'Beef pho' })).toEqual([]);
  });

  it('requires both locales and a non-blank vi', () => {
    expect(validateLocalizedName('name', { vi: '   ', en: 'Beef pho' })[0]?.code).toBe('missing_name');
    expect(validateLocalizedName('name', { vi: 'Phở', en: '' })[0]?.code).toBe('missing_name');
    expect(validateLocalizedName('name', null)[0]?.code).toBe('missing_name');
  });
});

describe('validateMoneyValue', () => {
  it('accepts a non-negative Money', () => {
    expect(validateMoneyValue('basePrice', money(65000, 'VND'))).toEqual([]);
  });

  it('rejects a negative price by default', () => {
    expect(validateMoneyValue('basePrice', money(-1, 'VND'))[0]?.code).toBe('invalid_price');
  });

  it('allows a negative delta only when asked', () => {
    expect(validateMoneyValue('priceDelta', money(-1000, 'VND'), { allowNegative: true })).toEqual([]);
  });

  it('rejects floats and non-money values', () => {
    expect(validateMoneyValue('basePrice', 65000)[0]?.code).toBe('invalid_price');
    expect(validateMoneyValue('basePrice', { minor: 1.5, currency: 'VND' })[0]?.code).toBe('invalid_price');
    expect(validateMoneyValue('basePrice', { minor: 1, currency: 'EUR' })[0]?.code).toBe('invalid_price');
  });
});

describe('validateReferenceValue', () => {
  it('accepts a prefixed id', () => {
    expect(validateReferenceValue('categoryId', 'category:drinks', ['category'])).toEqual([]);
  });

  it('rejects a wrong prefix or an empty segment', () => {
    expect(validateReferenceValue('categoryId', 'product:pho', ['category'])[0]?.code).toBe('invalid_reference');
    expect(validateReferenceValue('categoryId', 'category:', ['category'])[0]?.code).toBe('invalid_reference');
    expect(validateReferenceValue('categoryId', 42, ['category'])[0]?.code).toBe('invalid_reference');
  });
});

describe('assertNoIssues', () => {
  it('does nothing for an empty list', () => {
    expect(() => assertNoIssues('catalog_product "product:pho"', [])).not.toThrow();
  });

  it('throws one message listing every issue', () => {
    expect(() =>
      assertNoIssues('catalog_product "product:pho"', [
        issue('basePrice', 'invalid_price', 'basePrice must be a non-negative Money'),
        issue('barcode', 'invalid_barcode', 'barcode must not contain spaces'),
      ]),
    ).toThrow(/product:pho[\s\S]*invalid_price[\s\S]*invalid_barcode/);
  });
});
