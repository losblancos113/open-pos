import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { productDocId } from '../db/ids';
import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';
import type { CatalogIssue } from './validation';
import {
  assertNoIssues,
  issue,
  validateLocalizedName,
  validateMoneyValue,
  validateReferenceValue,
  validateSortOrder,
} from './validation';

/**
 * Sản phẩm — document trung tâm của catalog (§4.7).
 *
 * Sản phẩm sống ở **tầng global**: mọi chi nhánh dùng chung một định nghĩa món, và
 * từng chi nhánh chỉ override giá / bật-tắt bán / thứ tự (`override.ts`). Đó là lý do
 * `createProductDoc` luôn ghi `GLOBAL_BRANCH_ID`: ghi sai tầng sẽ làm branch khác
 * không thấy món mà không có lỗi nào hiện ra.
 *
 * Ngoài các field hệ thống dưới đây, sản phẩm còn mang **field tuỳ chỉnh** do type
 * `product` trong Type Registry (M1) khai báo — xem `product-type.ts`.
 */

export const PRODUCT_DOC_TYPE = 'catalog_product';

/** Kích cỡ (size) của một sản phẩm. Giá là **delta** cộng lên giá sản phẩm. */
export interface ProductVariant {
  /** Segment của `_id`, không chứa `:` — ví dụ `size-l`. */
  readonly id: string;
  readonly name: LocalizedText;
  /** Có thể âm (tô nhỏ rẻ hơn). Tổng giá vẫn phải ≥ 0 — xem `validateProduct`. */
  readonly priceDelta: Money;
}

export interface ProductDoc extends DocEnvelope<typeof PRODUCT_DOC_TYPE> {
  readonly name: LocalizedText;
  /** `category:<id>`, hoặc `null` khi chưa phân loại. */
  readonly categoryId: string | null;
  readonly basePrice: Money;
  /** Đơn vị bán: "phần", "ly", "chai"… */
  readonly unit: string | null;
  readonly variants: readonly ProductVariant[];
  /** `modifier_group:<id>` — nhóm topping áp cho món này. */
  readonly modifierGroupIds: readonly string[];
  readonly barcode: string | null;
  /**
   * Tham chiếu ảnh: URL, data URL, hoặc digest trên hub.
   * Pipeline resize/attachment của §13.2 chưa thuộc v1 (AGENTS.md §4.8).
   */
  readonly imageRef: string | null;
  readonly sku: string | null;
  readonly sortOrder: number;
  /** `false` = ngừng bán trên **mọi** chi nhánh; 86'd theo từng chi nhánh nằm ở override. */
  readonly isActive: boolean;
}

/**
 * Sản phẩm đọc ra khỏi store: mang thêm field tuỳ chỉnh nên cần index signature,
 * giống `RecordDocument` của M1 (`DocEnvelope` không tự nhận là `Record<string, unknown>`).
 */
export type ProductRecord = ProductDoc & Readonly<Record<string, unknown>>;

/** Khoá hệ thống của sản phẩm — field tuỳ chỉnh của type `product` không được trùng. */
export const PRODUCT_SYSTEM_FIELDS = [
  'name',
  'categoryId',
  'basePrice',
  'unit',
  'variants',
  'modifierGroupIds',
  'barcode',
  'imageRef',
  'sku',
  'sortOrder',
  'isActive',
] as const;

export interface CreateProductInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly basePrice: Money;
  readonly categoryId?: string | null;
  readonly unit?: string | null;
  readonly variants?: readonly ProductVariant[];
  readonly modifierGroupIds?: readonly string[];
  readonly barcode?: string | null;
  readonly imageRef?: string | null;
  readonly sku?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  /** Cho phép bơm thời gian trong test; mặc định lấy giờ hệ thống. */
  readonly now?: string;
}

/** Barcode đã chuẩn hoá: trim; chuỗi rỗng/space → `null`. */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Giá thấp nhất sản phẩm có thể bán được: `basePrice` cộng delta âm nhất trong các
 * variant. Dùng để chặn cấu hình mà ở đó một kích cỡ có giá âm — lỗi này nếu để lọt
 * sẽ chỉ lộ ra ở quầy, khi nhân viên chọn đúng kích cỡ đó.
 */
export function lowestVariantPrice(doc: ProductDoc): Money {
  let lowest = doc.basePrice.minor;
  for (const variant of doc.variants) {
    lowest = Math.min(lowest, doc.basePrice.minor + variant.priceDelta.minor);
  }
  return { minor: lowest, currency: doc.basePrice.currency };
}

/**
 * Dựng document sản phẩm ở tầng global.
 *
 * Factory chỉ dựng dữ liệu; validator mới là nơi báo lỗi. Nhưng nó vẫn `assertNoIssues`
 * ở cuối: một sản phẩm được tạo bằng code với giá âm là lỗi lập trình, phải nổ ngay tại
 * chỗ tạo chứ không phải đợi tới lúc lưu.
 */
export function createProductDoc(input: CreateProductInput): ProductDoc {
  const doc: ProductDoc = {
    ...createEnvelope({
      id: productDocId(input.id),
      docType: PRODUCT_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
      // `exactOptionalPropertyTypes` không cho truyền `now: undefined` thẳng.
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    name: input.name,
    categoryId: input.categoryId ?? null,
    basePrice: input.basePrice,
    unit: input.unit ?? null,
    variants: [...(input.variants ?? [])],
    modifierGroupIds: [...(input.modifierGroupIds ?? [])],
    barcode: normalizeBarcode(input.barcode),
    imageRef: input.imageRef ?? null,
    sku: input.sku ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };

  assertNoIssues(`catalog_product ${JSON.stringify(doc._id)}`, validateProduct(doc));
  return doc;
}

function validateVariant(path: string, variant: ProductVariant): CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  if (typeof variant.id !== 'string' || variant.id.trim() === '') {
    issues.push(issue(path, 'duplicate_variant_id', `${path}.id must be a non-empty string`));
  } else if (variant.id.includes(':')) {
    issues.push(
      issue(
        path,
        'duplicate_variant_id',
        `${path}.id must not contain ":", got ${JSON.stringify(variant.id)}`,
      ),
    );
  }

  issues.push(...validateLocalizedName(`${path}.name`, variant.name));
  issues.push(
    ...validateMoneyValue(`${path}.priceDelta`, variant.priceDelta, { allowNegative: true }),
  );

  return issues;
}

export function validateProduct(doc: ProductDoc): CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  issues.push(...validateLocalizedName('name', doc.name));
  issues.push(...validateMoneyValue('basePrice', doc.basePrice));

  if (doc.categoryId !== null) {
    issues.push(...validateReferenceValue('categoryId', doc.categoryId, ['category']));
  }

  doc.modifierGroupIds.forEach((id, index) => {
    issues.push(...validateReferenceValue(`modifierGroupIds[${index}]`, id, ['modifier_group']));
  });

  const seenVariants = new Set<string>();
  doc.variants.forEach((variant, index) => {
    const path = `variants[${index}]`;
    issues.push(...validateVariant(path, variant));

    if (seenVariants.has(variant.id)) {
      issues.push(
        issue(
          path,
          'duplicate_variant_id',
          `Variant id ${JSON.stringify(variant.id)} is declared more than once`,
        ),
      );
    }
    seenVariants.add(variant.id);
  });

  const lowest = lowestVariantPrice(doc);
  if (lowest.minor < 0) {
    issues.push(
      issue(
        'variants',
        'invalid_price',
        `Variants make the lowest price negative (${lowest.minor}); ` +
          'basePrice plus the smallest delta must stay ≥ 0',
      ),
    );
  }

  if (doc.barcode !== null) {
    if (/\s/.test(doc.barcode)) {
      issues.push(
        issue(
          'barcode',
          'invalid_barcode',
          `barcode must not contain spaces, got ${JSON.stringify(doc.barcode)}`,
        ),
      );
    } else if (doc.barcode.length > 64) {
      issues.push(
        issue(
          'barcode',
          'invalid_barcode',
          `barcode must be at most 64 characters, got ${doc.barcode.length}`,
        ),
      );
    }
  }

  issues.push(...validateSortOrder('sortOrder', doc.sortOrder));

  for (const [key, value] of [
    ['unit', doc.unit],
    ['imageRef', doc.imageRef],
    ['sku', doc.sku],
  ] as const) {
    if (value !== null && typeof value !== 'string') {
      issues.push(issue(key, 'invalid_reference', `${key} must be a string or null`));
    }
  }

  return issues;
}
