import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money } from '../../money';
import type { ProductDoc, ProductVariant } from '../product';
import { createProductDoc } from '../product';
import type { PriceListEntry } from '../price-list';
import { createPriceListDoc } from '../price-list';
import { createOverrideDoc } from '../override';
import { resolveProductPrice } from '../pricing';

const NOW = '2026-10-22T09:00:00.000Z';

const SIZE_M: ProductVariant = {
  id: 'size-m',
  name: { vi: 'Tô vừa', en: 'Medium' },
  priceDelta: money(0, 'VND'),
};

const SIZE_S: ProductVariant = {
  id: 'size-s',
  name: { vi: 'Tô nhỏ', en: 'Small' },
  priceDelta: money(-10000, 'VND'),
};

function productFixture(): ProductDoc {
  return createProductDoc({
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    variants: [SIZE_M, SIZE_S],
    now: NOW,
  });
}

const product = productFixture();

function listWith(entries: readonly PriceListEntry[]) {
  return createPriceListDoc({
    id: 'happy-hour',
    name: { vi: 'Giờ vàng', en: 'Happy hour' },
    effectiveFrom: '2026-10-22T14:00:00.000Z',
    branchId: 'hq',
    entries,
    now: NOW,
  });
}

function overrideWith(patch: { price?: ReturnType<typeof money>; available?: boolean } = {}) {
  return createOverrideDoc({ productId: 'product:pho-bo', branchId: 'hq', ...patch, now: NOW });
}

describe('resolveProductPrice', () => {
  it('falls back to basePrice plus the variant delta', () => {
    expect(resolveProductPrice({ product, override: null, priceList: null }, null)).toEqual({
      price: money(65000, 'VND'),
      source: 'base',
    });
    expect(resolveProductPrice({ product, override: null, priceList: null }, 'size-s')).toEqual({
      price: money(55000, 'VND'),
      source: 'base',
    });
  });

  it('lets a product-level price list entry replace the base price, keeping the delta', () => {
    const list = listWith([{ productId: 'product:pho-bo', variantId: null, price: money(60000, 'VND') }]);
    expect(resolveProductPrice({ product, override: null, priceList: list }, 'size-s')).toEqual({
      price: money(50000, 'VND'),
      source: 'price_list',
    });
  });

  it('treats a variant-specific entry as an absolute price, without the delta', () => {
    const list = listWith([{ productId: 'product:pho-bo', variantId: 'size-s', price: money(52000, 'VND') }]);
    // 52000, KHÔNG phải 52000 − 10000.
    expect(resolveProductPrice({ product, override: null, priceList: list }, 'size-s')).toEqual({
      price: money(52000, 'VND'),
      source: 'price_list',
    });
  });

  it('prefers the branch override over the active price list', () => {
    const list = listWith([{ productId: 'product:pho-bo', variantId: null, price: money(60000, 'VND') }]);
    const override = overrideWith({ price: money(69000, 'VND') });
    expect(resolveProductPrice({ product, override, priceList: list }, 'size-s')).toEqual({
      price: money(59000, 'VND'),
      source: 'override',
    });
  });

  it('keeps the price list when the override only sets availability', () => {
    const list = listWith([{ productId: 'product:pho-bo', variantId: null, price: money(60000, 'VND') }]);
    const override = overrideWith({ available: false });
    expect(resolveProductPrice({ product, override, priceList: list }, null)).toEqual({
      price: money(60000, 'VND'),
      source: 'price_list',
    });
  });

  it('ignores price list entries for other products', () => {
    const list = listWith([{ productId: 'product:com-ga', variantId: null, price: money(1000, 'VND') }]);
    expect(resolveProductPrice({ product, override: null, priceList: list }, null).source).toBe('base');
  });

  it('rejects an unknown variant', () => {
    expect(() =>
      resolveProductPrice({ product, override: null, priceList: null }, 'size-xxl'),
    ).toThrow(/size-xxl/);
  });

  it('rejects a currency mismatch instead of adding minor units blindly', () => {
    const list = listWith([{ productId: 'product:pho-bo', variantId: null, price: money(600, 'USD') }]);
    expect(() => resolveProductPrice({ product, override: null, priceList: list }, null)).toThrow(
      /currency/i,
    );
  });

  it('rejects a negative result', () => {
    // Validation chặn ở tầng lưu; đây là chốt cuối trước khi tiền vào bill.
    const override = { ...overrideWith(), price: money(-70000, 'VND') };
    expect(() => resolveProductPrice({ product, override, priceList: null }, 'size-s')).toThrow(
      /negative/i,
    );
  });

  it('rejects a variant-specific entry in the wrong currency', () => {
    const list = listWith([
      { productId: 'product:pho-bo', variantId: 'size-s', price: money(5200, 'USD') },
    ]);
    // Entry tuyệt đối nên không cộng delta — nhưng tiền tệ vẫn phải khớp product.
    expect(() => resolveProductPrice({ product, override: null, priceList: list }, 'size-s')).toThrow(
      /currency/i,
    );
  });

  it('never adds the variant delta twice', () => {
    fc.assert(
      fc.property(
        // base ≥ 10.000 để base + delta nhỏ nhất vẫn không âm — factory từ chối sản phẩm có giá âm.
        fc.integer({ min: 10000, max: 1_000_000 }),
        fc.integer({ min: -10000, max: 10000 }),
        (baseMinor, deltaMinor) => {
          const p = createProductDoc({
            id: 'pho-bo',
            name: { vi: 'Phở bò', en: 'Beef pho' },
            basePrice: money(baseMinor, 'VND'),
            variants: [
              { id: 'size-x', name: { vi: 'Cỡ X', en: 'Size X' }, priceDelta: money(deltaMinor, 'VND') },
            ],
            now: NOW,
          });

          const resolved = resolveProductPrice({ product: p, override: null, priceList: null }, 'size-x');
          expect(resolved.price.minor).toBe(baseMinor + deltaMinor);
        },
      ),
    );
  });
});
