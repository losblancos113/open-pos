import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { productBranchOverrideId } from '../db/ids';
import type { Money } from '../money';
import type { CatalogIssue } from './validation';
import {
  assertNoIssues,
  issue,
  validateMoneyValue,
  validateReferenceValue,
  validateSortOrder,
} from './validation';

/**
 * Phần khác biệt của một sản phẩm ở **một chi nhánh** (§4.7).
 *
 * Chỉ ba thứ được override: giá bán, còn bán hay không (86'd), và thứ tự hiển thị.
 * Mọi thứ khác của món vẫn lấy từ tầng global — sửa tên món một lần là mọi chi nhánh
 * thấy ngay, đúng lý do spec chọn override thay vì copy món cho từng chi nhánh.
 *
 * Một override **luôn** thuộc một chi nhánh thật; overwrite ở tầng global là vô nghĩa
 * nên bị từ chối ngay lúc dựng document.
 */

export const PRODUCT_OVERRIDE_DOC_TYPE = 'product_override';

export interface ProductOverrideDoc extends DocEnvelope<typeof PRODUCT_OVERRIDE_DOC_TYPE> {
  readonly productId: string;
  /** `null` = dùng giá global (hoặc bảng giá đang áp). */
  readonly price: Money | null;
  /** `false` = tạm hết món ở chi nhánh này. */
  readonly available: boolean;
  /** `null` = theo thứ tự global. */
  readonly sortOrder: number | null;
}

export interface SetOverrideInput {
  readonly productId: string;
  readonly branchId: string;
  readonly price?: Money | null;
  readonly available?: boolean;
  readonly sortOrder?: number | null;
  readonly now?: string;
}

/**
 * `_id` của override, dựng từ **doc id** của product: `product:pho-bo` + `hq`
 * → `product_override:hq:pho-bo`.
 *
 * Hai điểm dễ sai, cả hai đều có test khoá:
 *
 * 1. Helper M0 `productBranchOverrideId(productId, branchId)` nhận **segment trần**
 *    (`pho-bo`), không nhận doc id (`product:pho-bo`) — `requireSegment` của nó từ chối
 *    dấu `:`. Nên segment được tách ra ở đây, và id sinh ra vẫn đúng định dạng M0 đã
 *    ship (`product_override:<branchId>:<productId>`), không thêm tầng `product:`
 *    lồng bên trong.
 * 2. Thứ tự tham số của helper đọc **ngược** với chuỗi nó sinh ra (product trước,
 *    branch sau). Gọi sai thứ tự vẫn ra một `_id` "hợp lệ" nhưng sai chỗ.
 */
export function overrideDocId(productId: string, branchId: string): string {
  const prefix = 'product:';
  if (!productId.startsWith(prefix) || productId.length === prefix.length) {
    throw new Error(
      `overrideDocId(): productId must be a product document id (product:<id>), got ${JSON.stringify(productId)}`,
    );
  }
  return productBranchOverrideId(productId.slice(prefix.length), branchId);
}

export function createOverrideDoc(input: SetOverrideInput): ProductOverrideDoc {
  if (input.branchId === GLOBAL_BRANCH_ID) {
    throw new Error(
      'createOverrideDoc(): an override must target a real branch, not the global tier',
    );
  }

  const doc: ProductOverrideDoc = {
    ...createEnvelope({
      id: overrideDocId(input.productId, input.branchId),
      docType: PRODUCT_OVERRIDE_DOC_TYPE,
      branchId: input.branchId,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    productId: input.productId,
    price: input.price ?? null,
    available: input.available ?? true,
    sortOrder: input.sortOrder ?? null,
  };

  assertNoIssues(`product_override ${JSON.stringify(doc._id)}`, validateOverride(doc));
  return doc;
}

export function validateOverride(doc: ProductOverrideDoc): CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  issues.push(...validateReferenceValue('productId', doc.productId, ['product']));

  if (doc.price !== null) {
    issues.push(...validateMoneyValue('price', doc.price));
  }

  if (doc.sortOrder !== null) {
    issues.push(...validateSortOrder('sortOrder', doc.sortOrder));
  }

  if (doc.branchId === GLOBAL_BRANCH_ID) {
    issues.push(
      issue('branchId', 'invalid_scope', 'An override must target a real branch, not the global tier'),
    );
  }

  return issues;
}
