import type { CurrencyCode, Money } from '../money';

/**
 * Primitive validate dùng chung cho mọi document catalog.
 *
 * Mỗi model (`product.ts`, `price-list.ts`, …) có validator riêng, nhưng tất cả đều
 * kiểm cùng vài thứ: tên song ngữ, giá là `Money` hợp lệ, số thứ tự, tham chiếu
 * document. Gom ở đây để thông báo lỗi và mã lỗi không lệch nhau giữa các model —
 * UI tra bản dịch theo `code`, nên hai chỗ sinh hai code khác nhau cho cùng một lỗi
 * sẽ làm một nửa số lỗi hiện tiếng Anh.
 */

export type CatalogValidationCode =
  | 'missing_name'
  | 'invalid_price'
  | 'invalid_sort_order'
  | 'invalid_reference'
  | 'invalid_barcode'
  | 'duplicate_variant_id'
  | 'empty_options'
  | 'duplicate_option_id'
  | 'invalid_select_range'
  | 'default_count_out_of_range'
  | 'duplicate_group_key'
  | 'empty_groups'
  | 'invalid_price_window'
  | 'duplicate_price_entry'
  | 'invalid_scope';

export interface CatalogIssue {
  readonly path: string;
  readonly code: CatalogValidationCode;
  readonly message: string;
}

export function issue(path: string, code: CatalogValidationCode, message: string): CatalogIssue {
  return { path, code, message };
}

/**
 * Ném lỗi gộp mọi issue — dùng ở ranh giới tin cậy (factory, repository).
 *
 * `label` phải nhận diện được document ("catalog_product \"product:pho-bo\"") để người
 * đọc log biết ngay document nào sai, không phải mở từng field ra đoán.
 */
export function assertNoIssues(label: string, issues: readonly CatalogIssue[]): void {
  if (issues.length === 0) return;

  const details = issues.map((entry) => `  ${entry.code} at ${entry.path}: ${entry.message}`);
  throw new Error(`Invalid ${label}:\n${details.join('\n')}`);
}

function isBlankString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '';
}

/**
 * Tên song ngữ: `vi` là mặc định và `en` là dự phòng, nên cả hai phải có nội dung.
 * Một tên chỉ có `vi` sẽ hiện ô rỗng khi người dùng đổi locale sang `en`.
 */
export function validateLocalizedName(path: string, name: unknown): CatalogIssue[] {
  if (typeof name !== 'object' || name === null) {
    return [issue(path, 'missing_name', `${path} must be a bilingual name with vi and en`)];
  }

  const candidate = name as { vi?: unknown; en?: unknown };
  const issues: CatalogIssue[] = [];

  if (isBlankString(candidate.vi)) {
    issues.push(issue(path, 'missing_name', `${path}.vi must be a non-empty string`));
  }
  if (isBlankString(candidate.en)) {
    issues.push(issue(path, 'missing_name', `${path}.en must be a non-empty string`));
  }

  return issues;
}

/**
 * Phép kiểm `Money` của wire format: khoá `minor` là số nguyên an toàn, `currency`
 * nằm trong danh sách hỗ trợ.
 *
 * Trùng logic với `isMoney` trong `types/field-registry.ts` — hai module không import
 * nhau được (registry thuộc tầng type definition, không biết catalog), nên đây là bản
 * sao có chủ ý. Sửa một bên thì phải sửa bên kia.
 */
function isMoneyValue(value: unknown): value is Money {
  const CURRENCIES: readonly CurrencyCode[] = ['VND', 'USD'];
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as { minor?: unknown; currency?: unknown };
  return (
    typeof candidate.minor === 'number' &&
    Number.isSafeInteger(candidate.minor) &&
    typeof candidate.currency === 'string' &&
    (CURRENCIES as readonly string[]).includes(candidate.currency)
  );
}

/** Giá hợp lệ. `allowNegative: true` cho `priceDelta` của variant / modifier. */
export function validateMoneyValue(
  path: string,
  value: unknown,
  options?: { readonly allowNegative?: boolean },
): CatalogIssue[] {
  if (!isMoneyValue(value)) {
    return [
      issue(path, 'invalid_price', `${path} must be a Money object with integer minor units`),
    ];
  }

  if (value.minor < 0 && options?.allowNegative !== true) {
    return [issue(path, 'invalid_price', `${path} must not be negative, got ${value.minor}`)];
  }

  return [];
}

/** Số thứ tự hiển thị: số nguyên ≥ 0. */
export function validateSortOrder(path: string, value: unknown): CatalogIssue[] {
  if (!Number.isInteger(value) || (value as number) < 0) {
    return [
      issue(path, 'invalid_sort_order', `${path} must be a non-negative integer, got ${describe(value)}`),
    ];
  }
  return [];
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (typeof value === 'object') return 'object';
  return String(value);
}

/**
 * Khoảng chọn của một nhóm (modifier group, combo group).
 *
 * Quy tắc: `minSelect`/`maxSelect` là số nguyên ≥ 0; một nhóm **có** lựa chọn thì phải
 * cho chọn được ít nhất một cái (`maxSelect ≥ 1`) — nhóm có option mà `maxSelect = 0`
 * là cấu hình vô nghĩa; và `minSelect ≤ maxSelect ≤ optionCount`.
 */
export function validateSelectRange(
  /** Đường dẫn của **nhóm** sở hữu khoảng chọn; `''` khi nhóm chính là document. */
  parentPath: string,
  range: { readonly minSelect: number; readonly maxSelect: number; readonly optionCount: number },
): CatalogIssue[] {
  const { minSelect, maxSelect, optionCount } = range;
  const min = parentPath === '' ? 'minSelect' : `${parentPath}.minSelect`;
  const max = parentPath === '' ? 'maxSelect' : `${parentPath}.maxSelect`;
  const where = parentPath === '' ? 'the group' : parentPath;

  if (!Number.isInteger(minSelect) || minSelect < 0) {
    return [
      issue(min, 'invalid_select_range', `${min} must be a non-negative integer, got ${describe(minSelect)}`),
    ];
  }
  if (!Number.isInteger(maxSelect) || maxSelect < 0) {
    return [
      issue(max, 'invalid_select_range', `${max} must be a non-negative integer, got ${describe(maxSelect)}`),
    ];
  }
  if (optionCount > 0 && maxSelect < 1) {
    return [
      issue(
        max,
        'invalid_select_range',
        `${where} has ${optionCount} options but maxSelect is 0, so nothing can ever be selected`,
      ),
    ];
  }
  if (minSelect > maxSelect) {
    return [
      issue(min, 'invalid_select_range', `${min} ${minSelect} is greater than maxSelect ${maxSelect}`),
    ];
  }
  if (maxSelect > optionCount) {
    return [
      issue(
        max,
        'invalid_select_range',
        `${max} ${maxSelect} is greater than the ${optionCount} declared options`,
      ),
    ];
  }

  return [];
}

/**
 * Tham chiếu tới một document khác, dạng `prefix:<id>` (ví dụ `product:pho-bo`).
 *
 * Chỉ kiểm **hình dạng**; sự tồn tại của document đích là việc của repository (nó mới
 * đọc được store).
 */
export function validateReferenceValue(
  path: string,
  value: unknown,
  prefixes: readonly string[],
): CatalogIssue[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [
      issue(path, 'invalid_reference', `${path} must be a document id string, got ${describe(value)}`),
    ];
  }

  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    return [
      issue(
        path,
        'invalid_reference',
        `${path} must look like prefix:id with a non-empty id, got ${JSON.stringify(value)}`,
      ),
    ];
  }

  const prefix = value.slice(0, separator);
  if (!prefixes.includes(prefix)) {
    return [
      issue(
        path,
        'invalid_reference',
        `${path} must reference ${prefixes.join(' or ')}, got ${JSON.stringify(value)}`,
      ),
    ];
  }

  return [];
}
