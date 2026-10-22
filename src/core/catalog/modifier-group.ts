import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { modifierGroupDocId } from '../db/ids';
import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';
import type { CatalogIssue } from './validation';
import {
  assertNoIssues,
  issue,
  validateLocalizedName,
  validateMoneyValue,
  validateSelectRange,
  validateSortOrder,
} from './validation';

/**
 * Nhóm modifier (topping) — tầng global (§R2).
 *
 * Ví dụ: "Topping" chọn tối đa 1, "Ít đá / ít đường" chọn nhiều, "Món thêm" không bắt
 * buộc. `priceDelta` được phép âm vì lựa chọn có thể làm món rẻ đi ("không lấy trứng").
 *
 * Chưa hỗ trợ chọn số lượng (topping ×2) — ngoài phạm vi v1; khi cần sẽ là một field
 * riêng trên group, không phải thay đổi cấu trúc option.
 */

export const MODIFIER_GROUP_DOC_TYPE = 'catalog_modifier_group';

export interface ModifierOption {
  /** Segment của `_id`, không chứa `:` — ví dụ `it-da`. */
  readonly id: string;
  readonly name: LocalizedText;
  readonly priceDelta: Money;
  /** Được chọn sẵn khi mở món. Số lượng default phải nằm trong khoảng chọn. */
  readonly isDefault?: boolean;
}

export interface ModifierGroupDoc extends DocEnvelope<typeof MODIFIER_GROUP_DOC_TYPE> {
  readonly name: LocalizedText;
  /** 0 = không bắt buộc chọn. */
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly ModifierOption[];
  readonly sortOrder: number;
}

export interface CreateModifierGroupInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly options: readonly ModifierOption[];
  readonly minSelect?: number;
  readonly maxSelect?: number;
  readonly sortOrder?: number;
  readonly now?: string;
}

export function createModifierGroupDoc(input: CreateModifierGroupInput): ModifierGroupDoc {
  const doc: ModifierGroupDoc = {
    ...createEnvelope({
      id: modifierGroupDocId(input.id),
      docType: MODIFIER_GROUP_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    name: input.name,
    minSelect: input.minSelect ?? 0,
    maxSelect: input.maxSelect ?? 1,
    options: [...input.options],
    sortOrder: input.sortOrder ?? 0,
  };

  assertNoIssues(`catalog_modifier_group ${JSON.stringify(doc._id)}`, validateModifierGroup(doc));
  return doc;
}

export function validateModifierGroup(doc: ModifierGroupDoc): CatalogIssue[] {
  const issues: CatalogIssue[] = [
    ...validateLocalizedName('name', doc.name),
    ...validateSortOrder('sortOrder', doc.sortOrder),
  ];

  if (doc.options.length === 0) {
    issues.push(
      issue('options', 'empty_options', 'A modifier group must declare at least one option'),
    );
  }

  const seen = new Set<string>();
  let defaultCount = 0;

  doc.options.forEach((option, index) => {
    const path = `options[${index}]`;

    if (typeof option.id !== 'string' || option.id.trim() === '' || option.id.includes(':')) {
      issues.push(
        issue(
          path,
          'duplicate_option_id',
          `${path}.id must be a non-empty string without ":", got ${JSON.stringify(option.id)}`,
        ),
      );
    }

    issues.push(...validateLocalizedName(`${path}.name`, option.name));
    issues.push(...validateMoneyValue(`${path}.priceDelta`, option.priceDelta, { allowNegative: true }));

    if (seen.has(option.id)) {
      issues.push(
        issue(path, 'duplicate_option_id', `Option id ${JSON.stringify(option.id)} is declared more than once`),
      );
    }
    seen.add(option.id);

    if (option.isDefault === true) defaultCount += 1;
  });

  issues.push(
    ...validateSelectRange('', {
      minSelect: doc.minSelect,
      maxSelect: doc.maxSelect,
      optionCount: doc.options.length,
    }),
  );

  if (doc.options.length > 0 && (defaultCount < doc.minSelect || defaultCount > doc.maxSelect)) {
    issues.push(
      issue(
        'options',
        'default_count_out_of_range',
        `${defaultCount} option(s) are marked as default, which cannot satisfy ` +
          `minSelect ${doc.minSelect} … maxSelect ${doc.maxSelect}`,
      ),
    );
  }

  return issues;
}
