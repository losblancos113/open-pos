import { describe, it, expect, beforeEach } from 'vitest';
import { money } from '../../money';
import type { Money } from '../../money';
import type { DbAdapter } from '../../db/adapter';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { LocalizedText } from '../../types/definition';
import type { FieldDefinition } from '../../types/definition';
import type { BranchMenu, MenuItem } from '../menu';
import type { CatalogRepository } from '../catalog-repository';
import { createCatalogRepository } from '../catalog-repository';
import type { ProductRecord, ProductVariant } from '../product';
import { saveProductTypeDefinition } from '../product-type';
import { activePriceList } from '../price-list';
import { resolveProductPrice } from '../pricing';
import {
  exportCategoriesCsv,
  exportProductsCsv,
  importCategoriesCsv,
  importProductsCsv,
} from '../csv-catalog';

/**
 * Nghiệm thu M2: dựng **một menu phở thật** bằng đúng API mà UI gọi, rồi kiểm kết quả
 * cuối cùng — menu hiệu dụng của hai chi nhánh, ba tầng giá, và một vòng CSV.
 *
 * Các test đơn vị đã khoá từng quy tắc riêng (giá, 86'd, thứ tự, atomic của CSV). Test
 * này khoá việc chúng **ghép lại** đúng trên dữ liệu có đủ loại: kích cỡ, topping, combo,
 * bảng giá giờ vàng, override theo chi nhánh, và field tuỳ chỉnh của M1.
 *
 * Checkpoint §9.1 của M2 là "Catalog & menu đầy đủ (global + override) — dùng được cho:
 * nhập menu thật của quán". Đây là phần tự động của checkpoint đó; phần by-eye nằm ở
 * Task 19 Step 4 của plan.
 */

const NOW = '2026-10-22T09:00:00.000Z';

/** Giờ vàng 14:00–17:00 cùng ngày; mốc 15:00 chắc chắn nằm trong cửa sổ. */
const HAPPY_FROM = '2026-10-22T14:00:00.000Z';
const HAPPY_TO = '2026-10-22T17:00:00.000Z';
const DURING_HAPPY_HOUR = '2026-10-22T15:00:00.000Z';

const HQ = 'hq';
const OTHER_BRANCH = 'branch2';

let adapter: DbAdapter;
let repo: CatalogRepository;

beforeEach(async () => {
  adapter = await createMemoryAdapter();
  repo = createCatalogRepository(adapter, () => NOW);
  await seedMenu();
});

/** Bốn danh mục của quán phở, theo đúng thứ tự hiện trên menu. */
async function seedCategories(): Promise<void> {
  const categories = [
    { id: 'main', name: { vi: 'Món chính', en: 'Mains' }, sortOrder: 0 },
    { id: 'drinks', name: { vi: 'Đồ uống', en: 'Drinks' }, sortOrder: 1 },
    { id: 'dessert', name: { vi: 'Tráng miệng', en: 'Desserts' }, sortOrder: 2 },
    { id: 'topping', name: { vi: 'Món thêm', en: 'Sides' }, sortOrder: 3 },
  ] as const;

  for (const category of categories) await repo.createCategory(category);
}

/** Nhóm topping: ba lựa chọn, gắn vào Phở bò. */
async function seedToppingGroup(): Promise<void> {
  await repo.createModifierGroup({
    id: 'topping',
    name: { vi: 'Topping', en: 'Toppings' },
    minSelect: 0,
    maxSelect: 3,
    options: [
      { id: 'trung', name: { vi: 'Trứng', en: 'Egg' }, priceDelta: money(5000, 'VND') },
      { id: 'bo-them', name: { vi: 'Bò thêm', en: 'Extra beef' }, priceDelta: money(20000, 'VND') },
      {
        id: 'hanh-phi',
        name: { vi: 'Hành phi', en: 'Fried shallots' },
        priceDelta: money(3000, 'VND'),
      },
    ],
  });
}

/** Tám món: Phở bò mang nhóm topping, hai món có kích cỡ. */
async function seedProducts(): Promise<void> {
  await repo.createProduct({
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    categoryId: 'category:main',
    sortOrder: 1,
    barcode: '8935001',
    variants: [
      { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-10000, 'VND') },
      { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
    ],
    modifierGroupIds: ['modifier_group:topping'],
  });

  await repo.createProduct({
    id: 'pho-ga',
    name: { vi: 'Phở gà', en: 'Chicken pho' },
    basePrice: money(59000, 'VND'),
    categoryId: 'category:main',
    sortOrder: 2,
  });

  await repo.createProduct({
    id: 'pho-chay',
    name: { vi: 'Phở chay', en: 'Vegan pho' },
    basePrice: money(55000, 'VND'),
    categoryId: 'category:main',
    sortOrder: 3,
  });

  await repo.createProduct({
    id: 'com-ga',
    name: { vi: 'Cơm gà', en: 'Chicken rice' },
    basePrice: money(52000, 'VND'),
    categoryId: 'category:main',
    sortOrder: 4,
  });

  await repo.createProduct({
    id: 'tra-da',
    name: { vi: 'Trà đá', en: 'Iced tea' },
    basePrice: money(5000, 'VND'),
    categoryId: 'category:drinks',
    sortOrder: 0,
  });

  await repo.createProduct({
    id: 'ca-phe-sua',
    name: { vi: 'Cà phê sữa', en: 'Milk coffee' },
    basePrice: money(25000, 'VND'),
    categoryId: 'category:drinks',
    sortOrder: 1,
    variants: [
      { id: 'size-s', name: { vi: 'Ly nhỏ', en: 'Small' }, priceDelta: money(0, 'VND') },
      { id: 'size-m', name: { vi: 'Ly vừa', en: 'Medium' }, priceDelta: money(5000, 'VND') },
      { id: 'size-l', name: { vi: 'Ly lớn', en: 'Large' }, priceDelta: money(10000, 'VND') },
    ],
  });

  await repo.createProduct({
    id: 'che-dau',
    name: { vi: 'Chè đậu', en: 'Bean dessert' },
    basePrice: money(20000, 'VND'),
    categoryId: 'category:dessert',
    sortOrder: 0,
  });

  await repo.createProduct({
    id: 'trung-chien',
    name: { vi: 'Trứng chiên', en: 'Fried egg' },
    basePrice: money(10000, 'VND'),
    categoryId: 'category:topping',
    sortOrder: 0,
  });
}

/** Combo trưa 55.000: chọn 1 món chính + 1 đồ uống (§13.4). */
async function seedCombo(): Promise<void> {
  await repo.createCombo({
    id: 'com-trua',
    name: { vi: 'Cơm trưa', en: 'Lunch set' },
    basePrice: money(55000, 'VND'),
    categoryId: 'category:main',
    comboGroups: [
      {
        key: 'main',
        label: { vi: 'Món chính', en: 'Main' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt:pho-bo', productId: 'product:pho-bo', priceDelta: money(0, 'VND') },
          { optionId: 'opt:com-ga', productId: 'product:com-ga', priceDelta: money(0, 'VND') },
        ],
      },
      {
        key: 'drink',
        label: { vi: 'Nước', en: 'Drink' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt:tra-da', productId: 'product:tra-da', priceDelta: money(0, 'VND') },
          {
            optionId: 'opt:ca-phe-sua',
            productId: 'product:ca-phe-sua',
            priceDelta: money(10000, 'VND'),
          },
        ],
      },
    ],
  });
}

/**
 * Bảng giá giờ vàng của **một** chi nhánh. Trà đá cũng có entry ở đây để tầng override
 * của `hq` có cái đè lên — nếu không, "override thắng bảng giá" chỉ là câu nói suông.
 */
async function seedHappyHour(): Promise<void> {
  await repo.createPriceList({
    id: 'happy-hour',
    name: { vi: 'Giờ vàng', en: 'Happy hour' },
    branchId: HQ,
    effectiveFrom: HAPPY_FROM,
    effectiveTo: HAPPY_TO,
    priority: 1,
    entries: [
      { productId: 'product:pho-bo', variantId: null, price: money(60000, 'VND') },
      { productId: 'product:tra-da', variantId: null, price: money(4000, 'VND') },
    ],
  });
}

/** Ba override của `hq`: một món 86'd, một giá riêng, một thứ tự riêng. */
async function seedOverrides(): Promise<void> {
  await repo.setOverride({ productId: 'product:pho-chay', branchId: HQ, available: false });
  await repo.setOverride({ productId: 'product:tra-da', branchId: HQ, price: money(6000, 'VND') });
  // Cơm gà lên đầu "Món chính" ở hq dù thứ tự global của nó là 4.
  await repo.setOverride({ productId: 'product:com-ga', branchId: HQ, sortOrder: 0 });
}

async function seedMenu(): Promise<void> {
  await seedCategories();
  await seedToppingGroup();
  await seedProducts();
  await seedCombo();
  await seedHappyHour();
  await seedOverrides();
}

/** Món trong menu; ném lỗi khi thiếu để test không "xanh" vì một `undefined` lặng lẽ. */
function itemOf(menu: BranchMenu, docId: string): MenuItem {
  const item = menu.byId.get(docId);
  if (item === undefined) throw new Error(`menu of ${menu.branchId} has no ${docId}`);
  return item;
}

function idsOfGroup(menu: BranchMenu, categoryDocId: string): readonly string[] {
  const group = menu.groups.find((entry) => entry.category?._id === categoryDocId);
  if (group === undefined) throw new Error(`menu of ${menu.branchId} has no group ${categoryDocId}`);
  return group.items.map((item) => item.product._id);
}

/** Vòng CSV chỉ mang được những field này — so sánh đúng chúng, không so `_rev`/thời gian. */
interface CsvCarried {
  readonly _id: string;
  readonly name: LocalizedText;
  readonly categoryId: string | null;
  readonly basePrice: Money;
  readonly unit: string | null;
  readonly barcode: string | null;
  readonly sku: string | null;
  readonly imageRef: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly variants: readonly ProductVariant[];
}

function csvCarried(product: ProductRecord): CsvCarried {
  return {
    _id: product._id,
    name: product.name,
    categoryId: product.categoryId,
    basePrice: product.basePrice,
    unit: product.unit,
    barcode: product.barcode,
    sku: product.sku,
    imageRef: product.imageRef,
    sortOrder: product.sortOrder,
    isActive: product.isActive,
    variants: product.variants,
  };
}

function csvRows(products: readonly ProductRecord[]): readonly CsvCarried[] {
  return products.map(csvCarried).sort((a, b) => a._id.localeCompare(b._id));
}

function numberField(key: string): FieldDefinition {
  return { key, label: { vi: key, en: key }, dataType: 'number', required: false };
}

describe('M2 acceptance — a real menu, global plus branch overrides', () => {
  it('serves the menu at the global price outside the happy-hour window', async () => {
    const menu = await repo.menu({ branchId: HQ });

    expect(menu.priceListId).toBeNull();
    // 8 món trừ Phở chay đã bị 86'd ở hq.
    expect(menu.byId.size).toBe(8 - 1);

    // Không món nào trong số này có override/bảng giá → giá gốc của tầng global.
    expect(itemOf(menu, 'product:pho-bo').price).toEqual(money(65000, 'VND'));
    expect(itemOf(menu, 'product:pho-ga').price).toEqual(money(59000, 'VND'));
    expect(itemOf(menu, 'product:com-ga').price).toEqual(money(52000, 'VND'));
    expect(itemOf(menu, 'product:ca-phe-sua').price).toEqual(money(25000, 'VND'));
    expect(itemOf(menu, 'product:pho-bo').priceSource).toBe('base');

    // Chi nhánh chưa override gì thì thấy đủ 8 món, mọi giá là giá gốc.
    const other = await repo.menu({ branchId: OTHER_BRANCH });
    expect(other.byId.size).toBe(8);
    expect(other.priceListId).toBeNull();
    expect(itemOf(other, 'product:tra-da').price).toEqual(money(5000, 'VND'));

    // Thứ tự nhóm theo category; nhóm "chưa phân loại" không có ở đây.
    expect(menu.groups.map((group) => group.category?._id)).toEqual([
      'category:main',
      'category:drinks',
      'category:dessert',
      'category:topping',
    ]);
    expect(menu.danglingCategoryRefs).toEqual([]);
  });

  it('applies the happy-hour price list inside the window', async () => {
    const menu = await repo.menu({ branchId: HQ, now: DURING_HAPPY_HOUR });

    expect(menu.priceListId).toBe('price_list:happy-hour');

    const phoBo = itemOf(menu, 'product:pho-bo');
    expect(phoBo.price).toEqual(money(60000, 'VND'));
    expect(phoBo.priceSource).toBe('price_list');

    // Món không có entry trong bảng giá vẫn rơi về giá gốc, không bị mất giá.
    expect(itemOf(menu, 'product:com-ga').price).toEqual(money(52000, 'VND'));
    expect(itemOf(menu, 'product:com-ga').priceSource).toBe('base');

    // Entry theo product là **giá nền**: kích cỡ vẫn chênh nhau như cấu hình món.
    const priceList = activePriceList(await repo.listPriceLists(HQ), DURING_HAPPY_HOUR);
    expect(
      resolveProductPrice({ product: phoBo.product, override: null, priceList }, 'size-l').price,
    ).toEqual(money(69000, 'VND'));

    // Chi nhánh khác không thấy bảng giá của hq.
    const other = await repo.menu({ branchId: OTHER_BRANCH, now: DURING_HAPPY_HOUR });
    expect(other.priceListId).toBeNull();
    expect(itemOf(other, 'product:pho-bo').price).toEqual(money(65000, 'VND'));
  });

  it('prefers the branch override over the happy-hour list', async () => {
    const menu = await repo.menu({ branchId: HQ, now: DURING_HAPPY_HOUR });

    // Bảng giá đang áp (4.000) nhưng override giá riêng của hq (6.000) mới là giá bán.
    expect(menu.priceListId).toBe('price_list:happy-hour');
    const traDa = itemOf(menu, 'product:tra-da');
    expect(traDa.price).toEqual(money(6000, 'VND'));
    expect(traDa.priceSource).toBe('override');

    // Override chỉ giá không kéo theo gì khác: Phở bò vẫn theo bảng giá.
    expect(itemOf(menu, 'product:pho-bo').priceSource).toBe('price_list');
  });

  it('hides the 86’d item in one branch and keeps it in the other', async () => {
    expect((await repo.menu({ branchId: HQ })).byId.has('product:pho-chay')).toBe(false);
    expect((await repo.menu({ branchId: OTHER_BRANCH })).byId.has('product:pho-chay')).toBe(true);

    // Màn hình quản lý cần thấy món đã 86'd để bật lại — cùng dữ liệu, khác `includeUnavailable`.
    const managed = await repo.menu({ branchId: HQ, includeUnavailable: true });
    expect(itemOf(managed, 'product:pho-chay').available).toBe(false);
  });

  it('lets the branch re-order an item with its own sort order', async () => {
    // Global: Cơm gà đứng cuối "Món chính" (sortOrder 4).
    const other = await repo.menu({ branchId: OTHER_BRANCH });
    expect(idsOfGroup(other, 'category:main')).toEqual([
      'product:pho-bo',
      'product:pho-ga',
      'product:pho-chay',
      'product:com-ga',
    ]);

    // hq: override sortOrder 0 kéo Cơm gà lên đầu, phần còn lại giữ thứ tự global.
    const menu = await repo.menu({ branchId: HQ });
    expect(idsOfGroup(menu, 'category:main')).toEqual([
      'product:com-ga',
      'product:pho-bo',
      'product:pho-ga',
    ]);

    // Thứ tự global không bị sửa: chi nhánh khác vẫn nguyên.
    expect((await repo.listProducts()).find((p) => p._id === 'product:com-ga')?.sortOrder).toBe(4);
  });

  it('keeps a custom product field working with sizes, topping and CSV in one flow', async () => {
    // Type `product` của M1, có thêm field tuỳ chỉnh `spicy_level`.
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });

    const created = await repo.createProduct({
      id: 'pho-tai',
      name: { vi: 'Phở tái', en: 'Rare beef pho' },
      basePrice: money(67000, 'VND'),
      categoryId: 'category:main',
      sortOrder: 5,
      variants: [
        { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-8000, 'VND') },
      ],
      modifierGroupIds: ['modifier_group:topping'],
      spicy_level: 2,
    });

    expect(created.spicy_level).toBe(2);

    // Xuất menu, sửa đúng một giá rồi nhập lại — đường "sửa menu bằng Excel" của Task 19.
    const exported = exportProductsCsv(await repo.listProducts(), 'VND');
    const edited = exported.replace(',67000,', ',68000,');
    expect(edited).not.toBe(exported); // nếu chuỗi đổi thì test đang nhập lại mà không sửa gì.

    await importProductsCsv(repo, edited, { currency: 'VND' });

    const reloaded = await repo.getProduct('pho-tai');
    expect(reloaded?.basePrice).toEqual(money(68000, 'VND'));
    // CSV không mang field tuỳ chỉnh; bản cập nhật phải giữ nguyên giá trị đang có.
    expect(reloaded?.spicy_level).toBe(2);
    // Kích cỡ và topping cũng còn nguyên sau vòng nhập.
    expect(reloaded?.variants).toEqual([
      { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-8000, 'VND') },
    ]);
    expect(reloaded?.modifierGroupIds).toEqual(['modifier_group:topping']);
  });

  it('round-trips the whole menu through CSV without losing variants or prices', async () => {
    const source = await repo.listProducts();
    const csv = exportProductsCsv(source, 'VND');

    const fresh = createCatalogRepository(await createMemoryAdapter(), () => NOW);
    // Danh mục trước, món sau — product trỏ tới `category:<id>` nên thiếu nó là lỗi.
    await importCategoriesCsv(fresh, exportCategoriesCsv(await repo.listCategories()));
    const summary = await importProductsCsv(fresh, csv, { currency: 'VND' });

    expect(summary.created).toHaveLength(source.length);
    const roundTripped = await fresh.listProducts();
    expect(csvRows(roundTripped)).toEqual(csvRows(source));

    // So sánh ở chi nhánh **không** có override/bảng giá: CSV chỉ mang tầng global — còn
    // override và bảng giá là document riêng của từng chi nhánh, không nằm trong tệp món
    // (nhập tệp này vào quán mới không kéo theo giờ vàng của quán cũ — đúng như thiết kế).
    const [before, after] = [
      await repo.menu({ branchId: OTHER_BRANCH }),
      await fresh.menu({ branchId: OTHER_BRANCH }),
    ];
    expect([...after.byId.keys()].sort()).toEqual([...before.byId.keys()].sort());
    for (const [docId, item] of before.byId) {
      expect(itemOf(after, docId).price).toEqual(item.price);
    }
    // Combo là document riêng, không nằm trong CSV món — nhưng phải còn nguyên ở quán gốc.
    expect((await repo.listCombos()).map((combo) => combo._id)).toEqual(['combo:com-trua']);
  });

  it('modules the money invariants: every menu price is an integer minor unit', async () => {
    const menu = await repo.menu({ branchId: HQ, now: DURING_HAPPY_HOUR });
    const priceList = activePriceList(await repo.listPriceLists(HQ), DURING_HAPPY_HOUR);
    const overrides = new Map(
      (await repo.listOverrides(HQ)).map((override) => [override.productId, override]),
    );

    // Mọi con số màn hình bán hàng có thể hiện: giá product + giá từng kích cỡ của nó.
    const prices: Money[] = [];
    for (const item of menu.byId.values()) {
      const context = {
        product: item.product,
        override: overrides.get(item.product._id) ?? null,
        priceList,
      };
      for (const variantId of [null, ...item.product.variants.map((variant) => variant.id)]) {
        prices.push(resolveProductPrice(context, variantId).price);
      }
    }

    // 7 món đang bán (Phở bò 2 kích cỡ, Cà phê sữa 3 kích cỡ) → 12 con số.
    expect(prices).toHaveLength(12);
    for (const price of prices) {
      expect(Number.isSafeInteger(price.minor)).toBe(true);
      expect(price.currency).toBe('VND');
    }
  });
});
