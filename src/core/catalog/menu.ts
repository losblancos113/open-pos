import type { Money } from '../money';
import type { CategoryDoc } from './category';
import type { ProductDoc } from './product';
import { normalizeBarcode } from './product';
import type { PriceListDoc } from './price-list';
import type { ProductOverrideDoc } from './override';
import type { PriceSourceKind } from './pricing';
import { resolveProductPrice } from './pricing';

/**
 * Menu hiệu dụng của một chi nhánh — thứ màn hình bán hàng đọc (M3) và QR order đọc (M5).
 *
 * Hàm thuần, không đụng adapter: mọi thứ nó cần được truyền vào, nên kiểm chứng được
 * từng quy tắc (giá, 86'd, thứ tự, category gãy) mà không cần DB.
 */

export interface MenuItem {
  readonly product: ProductDoc;
  readonly price: Money;
  readonly priceSource: PriceSourceKind;
  /** `isActive` toàn hệ thống **và** không bị 86'd ở chi nhánh này. */
  readonly available: boolean;
  /** `override.sortOrder` nếu có, ngược lại `product.sortOrder`. */
  readonly sortOrder: number;
}

export interface MenuGroup {
  /** `null` = nhóm "chưa phân loại" (không có category, hoặc category đã bị xoá). */
  readonly category: CategoryDoc | null;
  readonly items: readonly MenuItem[];
}

export interface BranchMenu {
  readonly branchId: string;
  readonly groups: readonly MenuGroup[];
  readonly byId: ReadonlyMap<string, MenuItem>;
  /** Chỉ chứa sản phẩm đang bán — quét mã vạch một món đã 86'd phải không ra gì. */
  readonly byBarcode: ReadonlyMap<string, MenuItem>;
  readonly priceListId: string | null;
  /** Sản phẩm trỏ tới category không tồn tại — dữ liệu cần sửa, không phải món cần ẩn. */
  readonly danglingCategoryRefs: readonly string[];
}

export interface AssembleMenuInput {
  readonly branchId: string;
  readonly categories: readonly CategoryDoc[];
  readonly products: readonly ProductDoc[];
  /** Chỉ override của chi nhánh này được áp; override của chi nhánh khác bị bỏ qua. */
  readonly overrides: readonly ProductOverrideDoc[];
  readonly priceList: PriceListDoc | null;
  /** `true` để thấy cả món đã 86'd / ngừng bán (màn hình quản lý cần). Mặc định `false`. */
  readonly includeUnavailable?: boolean;
}

function priceContext(
  product: ProductDoc,
  override: ProductOverrideDoc | null,
  priceList: PriceListDoc | null,
): { product: ProductDoc; override: ProductOverrideDoc | null; priceList: PriceListDoc | null } {
  return { product, override, priceList };
}

export function assembleMenu(input: AssembleMenuInput): BranchMenu {
  const includeUnavailable = input.includeUnavailable === true;
  const categoriesById = new Map(input.categories.map((category) => [category._id, category]));

  // Override của chi nhánh khác không được lộ sang — lọc lại một lần nữa ở đây dù nơi
  // gọi đã lọc, vì đây là ranh giới mà một lỗi sẽ thành giá sai cho khách.
  const overridesByProduct = new Map<string, ProductOverrideDoc>();
  for (const override of input.overrides) {
    if (override.branchId === input.branchId) overridesByProduct.set(override.productId, override);
  }

  const items: MenuItem[] = [];
  const danglingCategoryRefs: string[] = [];

  for (const product of input.products) {
    const override = overridesByProduct.get(product._id) ?? null;
    const available = product.isActive && (override?.available ?? true);
    if (!available && !includeUnavailable) continue;

    const resolved = resolveProductPrice(priceContext(product, override, input.priceList), null);

    items.push({
      product,
      price: resolved.price,
      priceSource: resolved.source,
      available,
      sortOrder: override?.sortOrder ?? product.sortOrder,
    });
  }

  const grouped = new Map<string, MenuItem[]>();
  for (const item of items) {
    const categoryId = item.product.categoryId;
    const key = categoryId !== null && categoriesById.has(categoryId) ? categoryId : '';

    if (categoryId !== null && !categoriesById.has(categoryId)) {
      danglingCategoryRefs.push(item.product._id);
    }

    const bucket = grouped.get(key);
    if (bucket === undefined) grouped.set(key, [item]);
    else bucket.push(item);
  }

  const sortedGroups: MenuGroup[] = [...grouped.entries()]
    .map(([key, groupItems]) => ({
      category: key === '' ? null : (categoriesById.get(key) ?? null),
      items: [...groupItems].sort(compareItems),
    }))
    .sort(compareGroups);

  const byId = new Map<string, MenuItem>();
  const byBarcode = new Map<string, MenuItem>();

  for (const group of sortedGroups) {
    for (const item of group.items) {
      byId.set(item.product._id, item);
    }
  }

  // Quét mã vạch của món đã 86'd phải không ra gì, nên chỉ index món đang bán.
  for (const item of items) {
    if (!item.available) continue;
    const barcode = normalizeBarcode(item.product.barcode);
    if (barcode === null || byBarcode.has(barcode)) continue;
    byBarcode.set(barcode, item);
  }

  return {
    branchId: input.branchId,
    groups: sortedGroups,
    byId,
    byBarcode,
    priceListId: input.priceList?._id ?? null,
    danglingCategoryRefs,
  };
}

/** Thứ tự hiển thị: `sortOrder` → tên vi → `_id`, để hai terminal luôn giống nhau. */
function compareItems(a: MenuItem, b: MenuItem): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.product.name.vi.localeCompare(b.product.name.vi) ||
    a.product._id.localeCompare(b.product._id)
  );
}

/** Nhóm theo thứ tự khai báo của category; nhóm "chưa phân loại" luôn nằm cuối. */
function compareGroups(a: MenuGroup, b: MenuGroup): number {
  if (a.category === null) return b.category === null ? 0 : 1;
  if (b.category === null) return -1;

  return a.category.sortOrder - b.category.sortOrder || a.category._id.localeCompare(b.category._id);
}
