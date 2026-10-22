import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { activePriceList, createPriceListDoc, priceListEntry, validatePriceList } from '../price-list';

function list(over: Partial<Parameters<typeof createPriceListDoc>[0]> = {}) {
  return createPriceListDoc({
    id: 'happy-hour',
    name: { vi: 'Giờ vàng', en: 'Happy hour' },
    effectiveFrom: '2026-10-22T14:00:00.000Z',
    branchId: 'hq',
    now: '2026-10-22T09:00:00.000Z',
    ...over,
  });
}

describe('validatePriceList', () => {
  it('accepts an open-ended list', () => {
    expect(validatePriceList(list())).toEqual([]);
  });

  it('reads timestamps as instants, not as strings', () => {
    // Hai chuỗi ISO khác độ chính xác: so sánh theo chuỗi sẽ sai thứ tự.
    const doc = list({
      effectiveFrom: '2026-10-22T14:00:00Z',
      effectiveTo: '2026-10-22T14:30:01.000Z',
    });
    expect(validatePriceList(doc)).toEqual([]);
  });

  // Factory từ chối dữ liệu sai (assertNoIssues), nên các ca "không hợp lệ" được dựng
  // bằng spread — validatePriceList vẫn phải là nơi báo lỗi cho document đến từ store.
  it('rejects an invalid or inverted window', () => {
    expect(validatePriceList({ ...list(), effectiveFrom: 'hôm qua' })[0]?.code).toBe(
      'invalid_price_window',
    );
    expect(
      validatePriceList({ ...list(), effectiveTo: '2026-10-22T13:00:00.000Z' })[0]?.code,
    ).toBe('invalid_price_window');
    expect(
      validatePriceList({ ...list(), effectiveTo: '2026-10-22T14:00:00.000Z' })[0]?.code,
    ).toBe('invalid_price_window');
  });

  it('rejects a fractional priority and a negative price entry', () => {
    expect(validatePriceList({ ...list(), priority: 1.5 })[0]?.code).toBe('invalid_sort_order');
    expect(
      validatePriceList({
        ...list(),
        entries: [{ productId: 'product:pho', variantId: null, price: money(-1, 'VND') }],
      }).some((e) => e.code === 'invalid_price'),
    ).toBe(true);
  });

  it('rejects duplicate (product, variant) entries', () => {
    const doc = {
      ...list(),
      entries: [
        { productId: 'product:pho', variantId: null, price: money(60000, 'VND') },
        { productId: 'product:pho', variantId: null, price: money(61000, 'VND') },
      ],
    };
    expect(validatePriceList(doc).some((e) => e.code === 'duplicate_price_entry')).toBe(true);
  });
});

describe('activePriceList', () => {
  it('ignores lists outside their window', () => {
    const doc = list({ effectiveTo: '2026-10-22T15:00:00.000Z' });
    expect(activePriceList([doc], '2026-10-22T16:00:00.000Z')).toBeNull();
    // Trước effectiveFrom (14:00) cũng chưa áp dụng — cửa sổ không mở sớm.
    expect(activePriceList([doc], '2026-10-22T13:59:59.000Z')).toBeNull();
    expect(activePriceList([doc], '2026-10-22T14:30:00.000Z')).toBe(doc);
  });

  it('treats the window as half-open [from, to)', () => {
    const doc = list({ effectiveTo: '2026-10-22T15:00:00.000Z' });
    expect(activePriceList([doc], '2026-10-22T15:00:00.000Z')).toBeNull();
  });

  it('prefers a higher priority', () => {
    const low = list({ id: 'low', priority: 0 });
    const high = list({ id: 'high', priority: 5 });
    expect(activePriceList([low, high], '2026-10-22T14:30:00.000Z')).toBe(high);
  });

  it('breaks a priority tie with the newest effectiveFrom, then the smallest id', () => {
    const older = list({ id: 'older', effectiveFrom: '2026-10-22T12:00:00.000Z' });
    const newer = list({ id: 'newer', effectiveFrom: '2026-10-22T13:00:00.000Z' });
    expect(activePriceList([older, newer], '2026-10-22T14:30:00.000Z')).toBe(newer);

    // Cùng priority và cùng effectiveFrom: `price_list:b` < `price_list:newer` nên "b" thắng.
    const same = list({ id: 'b', effectiveFrom: '2026-10-22T13:00:00.000Z' });
    expect(activePriceList([same, newer], '2026-10-22T14:30:00.000Z')).toBe(same);
  });

  it('is deterministic regardless of input order', () => {
    const a = list({ id: 'a' });
    const b = list({ id: 'b' });
    expect(activePriceList([a, b], '2026-10-22T14:30:00.000Z')).toBe(
      activePriceList([b, a], '2026-10-22T14:30:00.000Z'),
    );
  });

  it('skips a list with an unreadable window instead of throwing', () => {
    // Dữ liệu xấu không được làm sập màn hình bán hàng.
    const broken = { ...list({ id: 'broken' }), effectiveFrom: 'hôm qua' };
    expect(activePriceList([broken, list({ id: 'good' })], '2026-10-22T14:30:00.000Z')?._id).toBe(
      'price_list:good',
    );
  });
});

describe('priceListEntry', () => {
  const withEntries = list({
    entries: [
      { productId: 'product:pho', variantId: null, price: money(60000, 'VND') },
      { productId: 'product:pho', variantId: 'size-l', price: money(75000, 'VND') },
    ],
  });

  it('finds a variant-specific entry', () => {
    expect(priceListEntry(withEntries, 'product:pho', 'size-l')?.price).toEqual(money(75000, 'VND'));
  });

  it('falls back to the product-level entry', () => {
    expect(priceListEntry(withEntries, 'product:pho', 'size-m')?.price).toEqual(money(60000, 'VND'));
    expect(priceListEntry(withEntries, 'product:pho', null)?.price).toEqual(money(60000, 'VND'));
  });

  it('returns null for a product the list does not price', () => {
    expect(priceListEntry(withEntries, 'product:com', null)).toBeNull();
  });
});
