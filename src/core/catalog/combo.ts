import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { comboDocId } from '../db/ids';
import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';
import type { CatalogIssue } from './validation';
import {
  assertNoIssues,
  issue,
  validateLocalizedName,
  validateMoneyValue,
  validateReferenceValue,
  validateSelectRange,
  validateSortOrder,
} from './validation';

/**
 * Combo / set menu có lựa chọn — hình dạng theo §13.4.
 *
 * "Cơm phần + chọn 1 trong 3 món chính + chọn 1 trong 4 loại nước" là mô hình tối
 * thiểu để set menu dùng được thật. `optionId` phải **duy nhất trong cả combo** (không
 * chỉ trong nhóm) vì bill line tham chiếu lựa chọn bằng `optionId` — trùng id giữa hai
 * nhóm sẽ làm dòng bill mơ hồ.
 *
 * Combo không lồng combo: `productId` chỉ được trỏ tới `product:`.
 */

export const COMBO_DOC_TYPE = 'catalog_combo';

export interface ComboOption {
  /** Duy nhất trong cả combo — ví dụ `opt:pho`. */
  readonly optionId: string;
  /** `product:<id>` của món con. */
  readonly productId: string;
  readonly priceDelta: Money;
}

export interface ComboGroup {
  /** Duy nhất trong combo — ví dụ `main`. */
  readonly key: string;
  readonly label: LocalizedText;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly ComboOption[];
}

export interface ComboDoc extends DocEnvelope<typeof COMBO_DOC_TYPE> {
  readonly name: LocalizedText;
  readonly basePrice: Money;
  readonly comboGroups: readonly ComboGroup[];
  readonly categoryId: string | null;
  readonly imageRef: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface CreateComboInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly basePrice: Money;
  readonly comboGroups: readonly ComboGroup[];
  readonly categoryId?: string | null;
  readonly imageRef?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly now?: string;
}

export function createComboDoc(input: CreateComboInput): ComboDoc {
  const doc: ComboDoc = {
    ...createEnvelope({
      id: comboDocId(input.id),
      docType: COMBO_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    name: input.name,
    basePrice: input.basePrice,
    comboGroups: [...input.comboGroups],
    categoryId: input.categoryId ?? null,
    imageRef: input.imageRef ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };

  assertNoIssues(`catalog_combo ${JSON.stringify(doc._id)}`, validateCombo(doc));
  return doc;
}

function validateComboGroup(
  path: string,
  group: ComboGroup,
  seenKeys: Set<string>,
  seenOptionIds: Set<string>,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  if (typeof group.key !== 'string' || group.key.trim() === '') {
    issues.push(issue(path, 'duplicate_group_key', `${path}.key must be a non-empty string`));
  } else if (seenKeys.has(group.key)) {
    issues.push(
      issue(path, 'duplicate_group_key', `Group key ${JSON.stringify(group.key)} is declared more than once`),
    );
  }
  seenKeys.add(group.key);

  issues.push(...validateLocalizedName(`${path}.label`, group.label));

  if (group.options.length === 0) {
    issues.push(issue(`${path}.options`, 'empty_options', `${path} must declare at least one option`));
  }

  group.options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;

    if (typeof option.optionId !== 'string' || option.optionId.trim() === '') {
      issues.push(
        issue(optionPath, 'duplicate_option_id', `${optionPath}.optionId must be a non-empty string`),
      );
    } else if (seenOptionIds.has(option.optionId)) {
      issues.push(
        issue(
          optionPath,
          'duplicate_option_id',
          `Option id ${JSON.stringify(option.optionId)} is declared more than once in this combo`,
        ),
      );
    }
    seenOptionIds.add(option.optionId);

    issues.push(...validateReferenceValue(`${optionPath}.productId`, option.productId, ['product']));
    issues.push(
      ...validateMoneyValue(`${optionPath}.priceDelta`, option.priceDelta, { allowNegative: true }),
    );
  });

  issues.push(
    ...validateSelectRange(path, {
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      optionCount: group.options.length,
    }),
  );

  return issues;
}

export function validateCombo(doc: ComboDoc): CatalogIssue[] {
  const issues: CatalogIssue[] = [
    ...validateLocalizedName('name', doc.name),
    ...validateMoneyValue('basePrice', doc.basePrice),
    ...validateSortOrder('sortOrder', doc.sortOrder),
  ];

  if (doc.categoryId !== null) {
    issues.push(...validateReferenceValue('categoryId', doc.categoryId, ['category']));
  }

  if (doc.comboGroups.length === 0) {
    issues.push(
      issue('comboGroups', 'empty_groups', 'A combo must declare at least one selectable group'),
    );
  }

  const seenKeys = new Set<string>();
  const seenOptionIds = new Set<string>();

  doc.comboGroups.forEach((group, index) => {
    issues.push(...validateComboGroup(`comboGroups[${index}]`, group, seenKeys, seenOptionIds));
  });

  return issues;
}
