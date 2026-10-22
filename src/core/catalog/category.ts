import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { categoryDocId } from '../db/ids';
import type { LocalizedText } from '../types/definition';
import type { CatalogIssue } from './validation';
import { assertNoIssues, validateLocalizedName, validateSortOrder } from './validation';

/**
 * Danh mục món — tầng global (§4.7).
 *
 * Danh mục phẳng, không lồng nhau: menu quán Việt điển hình ("Khai vị / Món chính /
 * Tráng miệng / Đồ uống") không cần cây, và cây kéo theo vô số câu hỏi về thứ tự,
 * thừa kế trạng thái và xoá đệ quy mà v1 không có nhu cầu.
 */

export const CATEGORY_DOC_TYPE = 'catalog_category';

export interface CategoryDoc extends DocEnvelope<typeof CATEGORY_DOC_TYPE> {
  readonly name: LocalizedText;
  readonly sortOrder: number;
}

export interface CreateCategoryInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly sortOrder?: number;
  /** Cho phép bơm thời gian trong test; mặc định lấy giờ hệ thống. */
  readonly now?: string;
}

export function createCategoryDoc(input: CreateCategoryInput): CategoryDoc {
  const doc: CategoryDoc = {
    ...createEnvelope({
      id: categoryDocId(input.id),
      docType: CATEGORY_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    name: input.name,
    sortOrder: input.sortOrder ?? 0,
  };

  assertNoIssues(`catalog_category ${JSON.stringify(doc._id)}`, validateCategory(doc));
  return doc;
}

export function validateCategory(doc: CategoryDoc): CatalogIssue[] {
  return [
    ...validateLocalizedName('name', doc.name),
    ...validateSortOrder('sortOrder', doc.sortOrder),
  ];
}
