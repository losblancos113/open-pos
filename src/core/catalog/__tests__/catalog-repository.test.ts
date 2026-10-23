import { describe, it, expect, beforeEach } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import type { DbAdapter } from '../../db/adapter';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { CatalogRepository } from '../catalog-repository';
import { createCatalogRepository } from '../catalog-repository';

const NOW = '2026-10-22T09:00:00.000Z';

let adapter: DbAdapter;
let repo: CatalogRepository;

beforeEach(async () => {
  adapter = await createMemoryAdapter();
  repo = createCatalogRepository(adapter, () => NOW);
});

async function seedCategory(id = 'main') {
  return repo.createCategory({ id, name: { vi: 'Món chính', en: 'Mains' } });
}

/** `_rev` là optional trên `DocEnvelope`; mọi document đã ghi đều có nó. */
function revOf(doc: { _rev?: string }): string {
  if (doc._rev === undefined) throw new Error('expected the document to have a _rev');
  return doc._rev;
}

/** Tạo danh mục nếu chưa có — `seedProduct` cần nó, nhưng test có thể đã tạo trước. */
async function ensureCategory(id = 'main') {
  const existing = await repo.listCategories();
  if (existing.some((category) => category._id === `category:${id}`)) return;
  await seedCategory(id);
}

async function seedProduct(over: Record<string, unknown> = {}) {
  const input = {
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    variants: [
      { id: 'size-m', name: { vi: 'Tô vừa', en: 'Medium' }, priceDelta: money(0, 'VND') },
      { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
    ],
    categoryId: 'category:main',
    barcode: '8935001',
    ...over,
  };

  if (input.categoryId === 'category:main') await ensureCategory('main');
  return repo.createProduct(input);
}

async function seedModifierGroup(id = 'topping') {
  return repo.createModifierGroup({
    id,
    name: { vi: 'Topping', en: 'Toppings' },
    options: [{ id: 'trung', name: { vi: 'Trứng', en: 'Egg' }, priceDelta: money(5000, 'VND') }],
  });
}

describe('catalog repository — global tier', () => {
  it('creates and lists categories and products', async () => {
    await seedCategory('drinks');
    await seedCategory('main');
    await seedProduct();

    expect((await repo.listCategories()).map((c) => c._id)).toEqual([
      'category:drinks',
      'category:main',
    ]);
    expect((await repo.listProducts()).map((p) => p._id)).toEqual(['product:pho-bo']);
    expect((await repo.getProduct('pho-bo'))?.name.vi).toBe('Phở bò');
  });

  it('stores every global document with the global branchId', async () => {
    const category = await seedCategory();
    const product = await seedProduct();
    // Ghi vào branch 'hq' sẽ làm branch khác không thấy món — chốt chặn Review Focus #2.
    expect(category.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(product.branchId).toBe(GLOBAL_BRANCH_ID);
  });

  it('refuses a duplicate id with a message naming the id', async () => {
    await seedCategory();
    await expect(seedCategory()).rejects.toThrow(/category:main/);
  });

  it('refuses a product whose category does not exist', async () => {
    await expect(seedProduct({ categoryId: 'category:nope' })).rejects.toThrow(/category:nope/);
  });

  it('accepts a product whose category exists', async () => {
    await seedCategory();
    await expect(seedProduct()).resolves.toBeTruthy();
  });

  it('refuses a modifier group reference that does not exist', async () => {
    await expect(seedProduct({ modifierGroupIds: ['modifier_group:nope'] })).rejects.toThrow(
      /modifier_group:nope/,
    );
  });

  it('accepts a modifier group reference that exists', async () => {
    await seedModifierGroup();
    const product = await seedProduct({ modifierGroupIds: ['modifier_group:topping'] });
    expect(product.modifierGroupIds).toEqual(['modifier_group:topping']);
  });

  it('refuses a combo option pointing at a product that does not exist', async () => {
    await expect(
      repo.createCombo({
        id: 'com-trua',
        name: { vi: 'Cơm trưa', en: 'Lunch set' },
        basePrice: money(55000, 'VND'),
        comboGroups: [
          {
            key: 'main',
            label: { vi: 'Món chính', en: 'Main' },
            minSelect: 1,
            maxSelect: 1,
            options: [{ optionId: 'opt:pho', productId: 'product:nope', priceDelta: money(0, 'VND') }],
          },
        ],
      }),
    ).rejects.toThrow(/product:nope/);
  });

  it('refuses a combo option pointing at another combo', async () => {
    // Combo lồng combo không thuộc v1 — và "combo:other" sai hình dạng tham chiếu.
    await expect(
      repo.createCombo({
        id: 'com-trua',
        name: { vi: 'Cơm trưa', en: 'Lunch set' },
        basePrice: money(55000, 'VND'),
        comboGroups: [
          {
            key: 'main',
            label: { vi: 'Món chính', en: 'Main' },
            minSelect: 1,
            maxSelect: 1,
            options: [{ optionId: 'opt:x', productId: 'combo:other', priceDelta: money(0, 'VND') }],
          },
        ],
      }),
    ).rejects.toThrow(/combo:other/);
  });

  it('accepts a combo whose options all exist', async () => {
    await seedProduct();
    const combo = await repo.createCombo({
      id: 'com-trua',
      name: { vi: 'Cơm trưa', en: 'Lunch set' },
      basePrice: money(55000, 'VND'),
      comboGroups: [
        {
          key: 'main',
          label: { vi: 'Món chính', en: 'Main' },
          minSelect: 1,
          maxSelect: 1,
          options: [
            { optionId: 'opt:pho', productId: 'product:pho-bo', priceDelta: money(0, 'VND') },
          ],
        },
      ],
    });
    expect(combo._id).toBe('combo:com-trua');
  });

  it('keeps barcodes unique among active products', async () => {
    await seedProduct();
    await expect(
      repo.createProduct({
        id: 'pho-chay',
        name: { vi: 'Phở chay', en: 'Veggie pho' },
        basePrice: money(60000, 'VND'),
        barcode: '8935001',
      }),
    ).rejects.toThrow(/8935001/);
  });

  it('lets a barcode be reused once the first product is inactive or deleted', async () => {
    const first = await seedProduct();
    await repo.updateProduct('pho-bo', { isActive: false }, revOf(first));

    await expect(
      repo.createProduct({
        id: 'pho-chay',
        name: { vi: 'Phở chay', en: 'Veggie pho' },
        basePrice: money(60000, 'VND'),
        barcode: '8935001',
      }),
    ).resolves.toBeTruthy();
  });

  it('finds a product by barcode, ignoring blanks', async () => {
    await seedProduct();
    expect(await repo.findByBarcode('   ')).toBeNull();
    expect((await repo.findByBarcode(' 8935001 '))?._id).toBe('product:pho-bo');
  });

  it('reports a conflict when expectedRev is stale', async () => {
    await seedProduct();
    await expect(repo.updateProduct('pho-bo', { basePrice: money(70000, 'VND') }, '1-bogus')).rejects.toThrow(
      /conflict/i,
    );
  });

  it('keeps unpatched fields on update', async () => {
    const previous = await seedProduct();
    const updated = await repo.updateProduct(
      'pho-bo',
      { basePrice: money(70000, 'VND') },
      revOf(previous),
    );

    expect(updated.name.vi).toBe('Phở bò');
    expect(updated.variants).toEqual(previous.variants);
    expect(updated.barcode).toBe('8935001');
    expect(updated.basePrice).toEqual(money(70000, 'VND'));
    expect(updated._rev).not.toBe(previous._rev);
  });

  it('clears a nullable field with an explicit null', async () => {
    const previous = await seedCategory().then(() => seedProduct());
    const updated = await repo.updateProduct('pho-bo', { categoryId: null }, revOf(previous));
    expect(updated.categoryId).toBeNull();
  });

  it('refuses an update that would duplicate a barcode', async () => {
    await seedProduct();
    const second = await repo.createProduct({
      id: 'pho-chay',
      name: { vi: 'Phở chay', en: 'Veggie pho' },
      basePrice: money(60000, 'VND'),
      barcode: '9988776',
    });

    await expect(
      repo.updateProduct('pho-chay', { barcode: '8935001' }, revOf(second)),
    ).rejects.toThrow(/8935001/);
  });

  it('hides a soft-deleted product from reads', async () => {
    const product = await seedProduct();
    await repo.removeProduct('pho-bo', revOf(product));

    expect(await repo.listProducts()).toEqual([]);
    expect(await repo.getProduct('pho-bo')).toBeNull();
  });
});

describe('catalog repository — branch tier', () => {
  it('stores price lists and overrides on their own branch', async () => {
    await seedProduct();
    const list = await repo.createPriceList({
      id: 'happy-hour',
      name: { vi: 'Giờ vàng', en: 'Happy hour' },
      effectiveFrom: '2026-10-22T14:00:00.000Z',
      branchId: 'hq',
    });
    const override = await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      price: money(69000, 'VND'),
    });

    expect(list.branchId).toBe('hq');
    expect(override._id).toBe('product_override:hq:pho-bo');
  });

  it('never lists another branch price list or override', async () => {
    await seedProduct();
    await repo.createPriceList({
      id: 'hq-list',
      name: { vi: 'Giờ vàng', en: 'Happy hour' },
      effectiveFrom: '2026-10-22T14:00:00.000Z',
      branchId: 'hq',
    });
    await repo.createPriceList({
      id: 'b2-list',
      name: { vi: 'Giờ vàng', en: 'Happy hour' },
      effectiveFrom: '2026-10-22T14:00:00.000Z',
      branchId: 'branch2',
    });
    await repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') });
    await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'branch2',
      price: money(99000, 'VND'),
    });

    expect((await repo.listPriceLists('hq')).map((d) => d._id)).toEqual(['price_list:hq-list']);
    expect((await repo.listOverrides('hq')).map((d) => d._id)).toEqual([
      'product_override:hq:pho-bo',
    ]);
  });

  it('refuses an override for a product that does not exist', async () => {
    await expect(
      repo.setOverride({ productId: 'product:nope', branchId: 'hq', price: money(1, 'VND') }),
    ).rejects.toThrow(/product:nope/);
  });

  it('refuses an override on the global tier', async () => {
    await seedProduct();
    await expect(
      repo.setOverride({ productId: 'product:pho-bo', branchId: GLOBAL_BRANCH_ID }),
    ).rejects.toThrow(/global/i);
  });

  it('refuses a price list entry whose product or variant does not exist', async () => {
    await seedProduct();
    await expect(
      repo.createPriceList({
        id: 'happy-hour',
        name: { vi: 'Giờ vàng', en: 'Happy hour' },
        effectiveFrom: '2026-10-22T14:00:00.000Z',
        branchId: 'hq',
        entries: [{ productId: 'product:pho-bo', variantId: 'size-xxl', price: money(50000, 'VND') }],
      }),
    ).rejects.toThrow(/size-xxl/);

    await expect(
      repo.createPriceList({
        id: 'late-night',
        name: { vi: 'Khuya', en: 'Late night' },
        effectiveFrom: '2026-10-22T22:00:00.000Z',
        branchId: 'hq',
        entries: [{ productId: 'product:nope', variantId: null, price: money(50000, 'VND') }],
      }),
    ).rejects.toThrow(/product:nope/);
  });

  it('updates an override in place instead of creating a second document', async () => {
    await seedProduct();
    const first = await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      price: money(69000, 'VND'),
    });
    const second = await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      price: money(71000, 'VND'),
    });

    expect(second._id).toBe(first._id);
    expect(second._rev).not.toBe(first._rev);
    expect(await repo.listOverrides('hq')).toHaveLength(1);
  });

  it('survives two writes racing to create the same override', async () => {
    await seedProduct();

    // Người dùng double-click nút "còn bán" khi món chưa có override: hai lần ghi cùng thấy
    // "chưa có" rồi cùng insert. Lần thua trước đây ném lỗi conflict ra màn hình —
    // `pouch-adapter.put(): conflict for product_override:hq:pho-bo (got _rev undefined)` —
    // bắt được ở Task 19 by-eye.
    const [first, second] = await Promise.all([
      repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') }),
      repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', available: false }),
    ]);

    expect(first._id).toBe(second._id);

    const override = await repo.getOverride('product:pho-bo', 'hq');
    expect(override).not.toBeNull();
    // Lần thua phải đi tiếp trên bản vừa ghi: cả hai thay đổi đều sống, không mất dữ liệu.
    expect(override?.price).toEqual(money(69000, 'VND'));
    expect(override?.available).toBe(false);
    expect(await repo.listOverrides('hq')).toHaveLength(1);
  });

  it('keeps both changes when two updates to an existing override race', async () => {
    await seedProduct();
    await repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') });

    // Hai lần ghi cùng đọc một `_rev` rồi cùng put: lần thua phải đọc lại rồi hoà tiếp,
    // không ném conflict ra màn hình. Bắt được ở Task 19 by-eye khi gõ giá riêng.
    await Promise.all([
      repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(71000, 'VND') }),
      repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', available: false }),
    ]);

    const override = await repo.getOverride('product:pho-bo', 'hq');
    expect(override?.price).toEqual(money(71000, 'VND'));
    expect(override?.available).toBe(false);
    expect(await repo.listOverrides('hq')).toHaveLength(1);
  });

  it('leaves other override fields alone when only one is set', async () => {
    await seedProduct();
    await repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') });
    const second = await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      available: false,
    });

    expect(second.price).toEqual(money(69000, 'VND'));
    expect(second.available).toBe(false);
    expect(second.sortOrder).toBeNull();
  });

  it('clears an override price back to the global one with an explicit null', async () => {
    await seedProduct();
    await repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') });
    const cleared = await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      price: null,
    });

    expect(cleared.price).toBeNull();
  });

  it('removes an override outright', async () => {
    await seedProduct();
    await repo.setOverride({ productId: 'product:pho-bo', branchId: 'hq', price: money(69000, 'VND') });
    await repo.clearOverride('product:pho-bo', 'hq');

    expect(await repo.getOverride('product:pho-bo', 'hq')).toBeNull();
  });
});
