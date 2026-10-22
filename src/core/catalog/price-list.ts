import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { priceListDocId } from '../db/ids';
import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';
import type { CatalogIssue } from './validation';
import {
  assertNoIssues,
  issue,
  validateLocalizedName,
  validateMoneyValue,
  validateReferenceValue,
} from './validation';

/**
 * Bảng giá của một chi nhánh.
 *
 * Khác với override (một giá cho một món), bảng giá là một bộ giá áp trong **khoảng
 * thời gian** — "giờ vàng 14:00–17:00", "menu tết". Một bảng giá thuộc đúng một chi
 * nhánh (`branchId` của envelope), nên không có bảng giá global.
 *
 * Cửa sổ hiệu lực là **nửa mở** `[effectiveFrom, effectiveTo)`: hết giờ là hết giá,
 * không có giây thứ 60 nào dùng lại giá cũ.
 */

export const PRICE_LIST_DOC_TYPE = 'price_list';

export interface PriceListEntry {
  readonly productId: string;
  /** `null` = áp cho mọi kích cỡ của món. */
  readonly variantId: string | null;
  /** Giá **tuyệt đối** (không cộng delta của variant). */
  readonly price: Money;
}

export interface PriceListDoc extends DocEnvelope<typeof PRICE_LIST_DOC_TYPE> {
  readonly name: LocalizedText;
  /** ISO datetime. */
  readonly effectiveFrom: string;
  /** ISO datetime hoặc `null` (không có ngày kết thúc). */
  readonly effectiveTo: string | null;
  /** Bảng giá ưu tiên cao hơn thắng khi nhiều bảng cùng hiệu lực. */
  readonly priority: number;
  readonly entries: readonly PriceListEntry[];
}

export interface CreatePriceListInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | null;
  readonly priority?: number;
  readonly entries?: readonly PriceListEntry[];
  /** Bảng giá thuộc một chi nhánh — không có tầng global cho bảng giá. */
  readonly branchId: string;
  readonly now?: string;
}

export function createPriceListDoc(input: CreatePriceListInput): PriceListDoc {
  const doc: PriceListDoc = {
    ...createEnvelope({
      id: priceListDocId(input.id),
      docType: PRICE_LIST_DOC_TYPE,
      branchId: input.branchId,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    name: input.name,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    priority: input.priority ?? 0,
    entries: [...(input.entries ?? [])],
  };

  assertNoIssues(`price_list ${JSON.stringify(doc._id)}`, validatePriceList(doc));
  return doc;
}

/** `Date.parse` trả `NaN` cho chuỗi không phải thời điểm — đó là "cửa sổ không đọc được". */
function instantOf(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function validatePriceList(doc: PriceListDoc): CatalogIssue[] {
  const issues: CatalogIssue[] = [...validateLocalizedName('name', doc.name)];

  const from = instantOf(doc.effectiveFrom);
  if (from === null) {
    issues.push(
      issue(
        'effectiveFrom',
        'invalid_price_window',
        `effectiveFrom must be an ISO datetime, got ${JSON.stringify(doc.effectiveFrom)}`,
      ),
    );
  }

  if (doc.effectiveTo !== null) {
    const to = instantOf(doc.effectiveTo);
    if (to === null) {
      issues.push(
        issue(
          'effectiveTo',
          'invalid_price_window',
          `effectiveTo must be an ISO datetime, got ${JSON.stringify(doc.effectiveTo)}`,
        ),
      );
    } else if (from !== null && to <= from) {
      issues.push(
        issue(
          'effectiveTo',
          'invalid_price_window',
          `effectiveTo (${doc.effectiveTo}) must be after effectiveFrom (${doc.effectiveFrom})`,
        ),
      );
    }
  }

  if (!Number.isInteger(doc.priority) || doc.priority < 0) {
    issues.push(
      issue('priority', 'invalid_sort_order', `priority must be a non-negative integer, got ${doc.priority}`),
    );
  }

  const seen = new Set<string>();
  doc.entries.forEach((entry, index) => {
    const path = `entries[${index}]`;

    issues.push(...validateReferenceValue(`${path}.productId`, entry.productId, ['product']));
    issues.push(...validateMoneyValue(`${path}.price`, entry.price));

    if (entry.variantId !== null && (typeof entry.variantId !== 'string' || entry.variantId.trim() === '')) {
      issues.push(
        issue(path, 'invalid_reference', `${path}.variantId must be a non-empty string or null`),
      );
    }

    const key = `${entry.productId}|${entry.variantId ?? ''}`;
    if (seen.has(key)) {
      issues.push(
        issue(
          path,
          'duplicate_price_entry',
          `${path} prices ${entry.productId} (variant ${entry.variantId ?? 'all'}) a second time`,
        ),
      );
    }
    seen.add(key);
  });

  return issues;
}

/**
 * Bảng giá đang áp tại thời điểm `at`.
 *
 * Nhiều bảng giá có thể cùng hiệu lực — thứ tự quyết định: `priority` cao nhất →
 * `effectiveFrom` mới nhất → `_id` nhỏ nhất. Phải **xác định** (deterministic), nếu
 * không hai terminal có thể bán hai giá khác nhau và không ai truy được vì sao.
 *
 * Bảng giá có cửa sổ không đọc được bị **bỏ qua** chứ không ném lỗi: dữ liệu xấu không
 * được làm sập màn hình bán hàng.
 */
export function activePriceList(lists: readonly PriceListDoc[], at: string): PriceListDoc | null {
  const now = instantOf(at);
  if (now === null) return null;

  const usable = lists
    .map((list) => {
      const from = instantOf(list.effectiveFrom);
      const to = list.effectiveTo === null ? null : instantOf(list.effectiveTo);
      // Cả hai mốc phải đọc được; `effectiveTo` khai báo mà không parse được là dữ liệu xấu.
      const readable = from !== null && (list.effectiveTo === null || to !== null);
      return { list, from, to, readable };
    })
    .filter(
      (entry) =>
        entry.readable &&
        (entry.from as number) <= now &&
        (entry.to === null || now < entry.to),
    );

  if (usable.length === 0) return null;

  usable.sort((a, b) => {
    if (a.list.priority !== b.list.priority) return b.list.priority - a.list.priority;
    if (a.from !== b.from) return (b.from as number) - (a.from as number);
    return a.list._id.localeCompare(b.list._id);
  });

  return usable[0]?.list ?? null;
}

/**
 * Entry giá của một `(product, variant)`.
 *
 * Entry theo variant thắng entry theo product: "Tô lớn 75k" cụ thể hơn "mọi cỡ 60k".
 */
export function priceListEntry(
  list: PriceListDoc,
  productId: string,
  variantId: string | null,
): PriceListEntry | null {
  if (variantId !== null) {
    const exact = list.entries.find(
      (entry) => entry.productId === productId && entry.variantId === variantId,
    );
    if (exact) return exact;
  }

  return (
    list.entries.find((entry) => entry.productId === productId && entry.variantId === null) ?? null
  );
}
