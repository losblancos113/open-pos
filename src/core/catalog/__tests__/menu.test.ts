import { describe, it, expect, beforeEach } from 'vitest';
import { money } from '../../money';
import type { DbAdapter } from '../../db/adapter';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { LocalizedText } from '../../types/definition';
import type { CategoryDoc, CreateCategoryInput } from '../category';
import { createCategoryDoc } from '../category';
import type { CreateProductInput, ProductDoc } from '../product';
import { createProductDoc } from '../product';
import type { PriceListEntry } from '../price-list';
import { createPriceListDoc } from '../price-list';
import type { SetOverrideInput } from '../override';
import { createOverrideDoc } from '../override';
import type { AssembleMenuInput } from '../menu';
import { assembleMenu } from '../menu';
import type { CatalogRepository } from '../catalog-repository';
import { createCatalogRepository } from '../catalog-repository';

const NOW = '2026-10-22T09:00:00.000Z';

function makeCategory(id: string, name: LocalizedText, sortOrder = 0): CategoryDoc {
  const input: CreateCategoryInput = { id, name, sortOrder, now: NOW };
  return createCategoryDoc(input);
}

const main = makeCategory('main', { vi: 'Món chính', en: 'Mains' }, 0);
const drinks = makeCategory('drinks', { vi: 'Đồ uống', en: 'Drinks' }, 1);

function makeProduct(
  id: string,
  name: LocalizedText,
  over: Partial<CreateProductInput> = {},
): ProductDoc {
  return createProductDoc({ id, name, basePrice: money(65000, 'VND'), now: NOW, ...over });
}

const pho = makeProduct(
  'pho-bo',
  { vi: 'Phở bò', en: 'Beef pho' },
  { categoryId: 'category:main', sortOrder: 0, barcode: '8935001' },
);
const com = makeProduct('com-ga', { vi: 'Cơm gà', en: 'Chicken rice' }, {
  categoryId: 'category:main',
  sortOrder: 1,
});
const traDa = makeProduct(
  'tra-da',
  { vi: 'Trà đá', en: 'Iced tea' },
  { categoryId: 'category:drinks', basePrice: money(5000, 'VND') },
);
const mystery = makeProduct('mystery', { vi: 'Bí ẩn', en: 'Mystery' }, { categoryId: null });
const orphan = makeProduct('orphan', { vi: 'Mồ côi', en: 'Orphan' }, { categoryId: 'category:main' });

function makeOverride(
  branchId: string,
  productId: string,
  over: Partial<SetOverrideInput> = {},
) {
  return createOverrideDoc({ productId, branchId, now: NOW, ...over });
}

function makePriceList(id: string, branchId: string, entries: readonly PriceListEntry[]) {
  return createPriceListDoc({
    id,
    name: { vi: 'Giờ vàng', en: 'Happy hour' },
    effectiveFrom: '2026-10-22T14:00:00.000Z',
    branchId,
    entries,
    now: NOW,
  });
}

function input(over: Partial<AssembleMenuInput> = {}): AssembleMenuInput {
  return {
    branchId: 'hq',
    categories: [main, drinks],
    products: [pho, com, traDa],
    overrides: [],
    priceList: null,
    ...over,
  };
}

describe('assembleMenu', () => {
  it('groups items under their category, uncategorised last', () => {
    const menu = assembleMenu(input({ categories: [drinks, main], products: [pho, traDa, mystery] }));

    expect(menu.groups.map((group) => group.category?._id ?? null)).toEqual([
      'category:main',
      'category:drinks',
      null,
    ]);
    expect(menu.groups[0]?.items.map((item) => item.product._id)).toEqual(['product:pho-bo']);
    expect(menu.groups[2]?.items.map((item) => item.product._id)).toEqual(['product:mystery']);
  });

  it('keeps a product whose category is missing in the uncategorised group', () => {
    // Review Focus #4: xoá category không được làm món biến mất khỏi menu.
    const menu = assembleMenu(input({ categories: [drinks], products: [orphan] }));

    expect(menu.byId.get('product:orphan')).toBeTruthy();
    expect(menu.groups.map((group) => group.category?._id ?? null)).toEqual([null]);
    expect(menu.danglingCategoryRefs).toEqual(['product:orphan']);
  });

  it('applies this branch override price and never another branch', () => {
    const menu = assembleMenu(
      input({
        branchId: 'hq',
        overrides: [
          makeOverride('hq', 'product:pho-bo', { price: money(69000, 'VND') }),
          makeOverride('branch2', 'product:pho-bo', { price: money(99000, 'VND') }),
        ],
      }),
    );

    expect(menu.byId.get('product:pho-bo')?.price).toEqual(money(69000, 'VND'));
    expect(menu.byId.get('product:pho-bo')?.priceSource).toBe('override');
  });

  it('marks an 86’d product unavailable without dropping it from the menu build', () => {
    const menu = assembleMenu(
      input({
        includeUnavailable: true,
        overrides: [makeOverride('hq', 'product:pho-bo', { available: false })],
      }),
    );

    expect(menu.byId.get('product:pho-bo')?.available).toBe(false);
  });

  it('hides a product marked unavailable by this branch', () => {
    const menu = assembleMenu(
      input({ overrides: [makeOverride('hq', 'product:pho-bo', { available: false })] }),
    );

    expect(menu.byId.has('product:pho-bo')).toBe(false);
    expect(menu.byId.has('product:com-ga')).toBe(true);
  });

  it('hides unavailable products by default and includes them on request', () => {
    const unavailable = { ...pho, isActive: false };

    expect(assembleMenu(input({ products: [unavailable] })).byId.size).toBe(0);
    expect(assembleMenu(input({ products: [unavailable], includeUnavailable: true })).byId.size).toBe(1);
  });

  it('uses the override sortOrder, then the global one, then the name', () => {
    const byGlobalOrder = assembleMenu(input({ products: [com, pho] }));
    expect(byGlobalOrder.groups[0]?.items.map((item) => item.product._id)).toEqual([
      'product:pho-bo',
      'product:com-ga',
    ]);

    // Override kéo `com-ga` về cùng sortOrder 0 → hoà, xếp theo tên vi: "Cơm gà" < "Phở bò".
    const byOverrideOrder = assembleMenu(
      input({
        products: [com, pho],
        overrides: [makeOverride('hq', 'product:com-ga', { sortOrder: 0 })],
      }),
    );
    expect(byOverrideOrder.groups[0]?.items.map((item) => item.product._id)).toEqual([
      'product:com-ga',
      'product:pho-bo',
    ]);
  });

  it('indexes available products by barcode and skips blank barcodes', () => {
    const menu = assembleMenu(input({ products: [pho, traDa, { ...com, barcode: '   ' }] }));

    expect(menu.byBarcode.get('8935001')?.product._id).toBe('product:pho-bo');
    expect(menu.byBarcode.has('')).toBe(false);
    expect(menu.byBarcode.size).toBe(1);
  });

  it('does not index an unavailable product by barcode', () => {
    const menu = assembleMenu(
      input({
        includeUnavailable: true,
        overrides: [makeOverride('hq', 'product:pho-bo', { available: false })],
      }),
    );

    expect(menu.byBarcode.has('8935001')).toBe(false);
  });

  it('applies the active price list to items without an override', () => {
    const priceList = makePriceList('happy-hour', 'hq', [
      { productId: 'product:tra-da', variantId: null, price: money(6000, 'VND') },
    ]);

    const menu = assembleMenu(input({ priceList, products: [pho, traDa] }));

    expect(menu.byId.get('product:tra-da')?.price).toEqual(money(6000, 'VND'));
    expect(menu.byId.get('product:tra-da')?.priceSource).toBe('price_list');
    expect(menu.byId.get('product:pho-bo')?.priceSource).toBe('base');
    expect(menu.priceListId).toBe('price_list:happy-hour');
  });

  it('reports no price list when none is active', () => {
    expect(assembleMenu(input()).priceListId).toBeNull();
  });

  it('is deterministic for equal sort orders', () => {
    // Cùng sortOrder, cùng category, cùng tên vi → theo _id. Hai terminal phải thấy cùng thứ tự.
    const b = makeProduct('bbb', { vi: 'Bún', en: 'Noodles' }, { categoryId: 'category:main' });
    const a = makeProduct('aaa', { vi: 'Bún', en: 'Noodles' }, { categoryId: 'category:main' });

    const menu = assembleMenu(input({ products: [b, a] }));
    expect(menu.groups[0]?.items.map((item) => item.product._id)).toEqual([
      'product:aaa',
      'product:bbb',
    ]);
  });
});

describe('catalogRepository.menu', () => {
  let adapter: DbAdapter;
  let repo: CatalogRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createCatalogRepository(adapter, () => NOW);
  });

  async function seed() {
    await repo.createCategory({ id: 'main', name: { vi: 'Món chính', en: 'Mains' }, sortOrder: 0 });
    await repo.createProduct({
      id: 'pho-bo',
      name: { vi: 'Phở bò', en: 'Beef pho' },
      basePrice: money(65000, 'VND'),
      categoryId: 'category:main',
      barcode: '8935001',
    });
  }

  it('resolves prices with this branch price list at the requested instant', async () => {
    await seed();
    await repo.createPriceList({
      id: 'happy-hour',
      name: { vi: 'Giờ vàng', en: 'Happy hour' },
      effectiveFrom: '2026-10-22T14:00:00.000Z',
      effectiveTo: '2026-10-22T17:00:00.000Z',
      branchId: 'hq',
      entries: [{ productId: 'product:pho-bo', variantId: null, price: money(60000, 'VND') }],
    });

    const during = await repo.menu({ branchId: 'hq', now: '2026-10-22T15:00:00.000Z' });
    expect(during.byId.get('product:pho-bo')?.price).toEqual(money(60000, 'VND'));
    expect(during.priceListId).toBe('price_list:happy-hour');

    const after = await repo.menu({ branchId: 'hq', now: '2026-10-22T18:00:00.000Z' });
    expect(after.byId.get('product:pho-bo')?.price).toEqual(money(65000, 'VND'));
    expect(after.priceListId).toBeNull();
  });

  it('keeps other branches price lists and overrides out of the menu', async () => {
    await seed();
    await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'branch2',
      price: money(99000, 'VND'),
      available: false,
    });

    const menu = await repo.menu({ branchId: 'hq' });

    expect(menu.byId.get('product:pho-bo')?.price).toEqual(money(65000, 'VND'));
    expect(menu.byId.get('product:pho-bo')?.available).toBe(true);
  });

  it('applies this branch override, and the clock when now is omitted', async () => {
    await seed();
    await repo.setOverride({
      productId: 'product:pho-bo',
      branchId: 'hq',
      price: money(69000, 'VND'),
    });

    const menu = await repo.menu({ branchId: 'hq' });
    expect(menu.byId.get('product:pho-bo')?.price).toEqual(money(69000, 'VND'));
    expect(menu.byId.get('product:pho-bo')?.priceSource).toBe('override');
  });
});
