import { describe, it, expect } from 'vitest';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import { createCategoryDoc, validateCategory } from '../category';

const NOW = '2026-10-22T09:00:00.000Z';

function ok() {
  return createCategoryDoc({ id: 'drinks', name: { vi: 'Đồ uống', en: 'Drinks' }, now: NOW });
}

describe('createCategoryDoc', () => {
  it('builds a global category document', () => {
    const doc = ok();
    expect(doc._id).toBe('category:drinks');
    expect(doc.docType).toBe('catalog_category');
    expect(doc.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(doc.sortOrder).toBe(0);
    expect(validateCategory(doc)).toEqual([]);
  });

  it('keeps an explicit sort order', () => {
    const doc = createCategoryDoc({
      id: 'main',
      name: { vi: 'Món chính', en: 'Mains' },
      sortOrder: 2,
      now: NOW,
    });
    expect(doc.sortOrder).toBe(2);
  });
});

describe('validateCategory', () => {
  it('rejects a blank name or a fractional sortOrder', () => {
    expect(validateCategory({ ...ok(), name: { vi: ' ', en: 'x' } })[0]?.code).toBe('missing_name');
    expect(validateCategory({ ...ok(), sortOrder: 2.5 })[0]?.code).toBe('invalid_sort_order');
  });
});
