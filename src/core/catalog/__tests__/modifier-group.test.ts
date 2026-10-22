import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import type { ModifierOption } from '../modifier-group';
import { createModifierGroupDoc, validateModifierGroup } from '../modifier-group';

const NOW = '2026-10-22T09:00:00.000Z';

function option(id: string, delta = 0, isDefault = false): ModifierOption {
  return {
    id,
    name: { vi: `Lựa chọn ${id}`, en: `Option ${id}` },
    priceDelta: money(delta, 'VND'),
    ...(isDefault ? { isDefault: true } : {}),
  };
}

function ok() {
  return createModifierGroupDoc({
    id: 'topping',
    name: { vi: 'Topping', en: 'Toppings' },
    options: [option('trung', 5000), option('thit', 15000, true)],
    now: NOW,
  });
}

describe('createModifierGroupDoc', () => {
  it('builds a global document with single-select defaults', () => {
    const doc = ok();
    expect(doc._id).toBe('modifier_group:topping');
    expect(doc.docType).toBe('catalog_modifier_group');
    expect(doc.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(doc.minSelect).toBe(0);
    expect(doc.maxSelect).toBe(1);
    expect(doc.sortOrder).toBe(0);
  });

  it('accepts an optional single-select group', () => {
    expect(validateModifierGroup(ok())).toEqual([]);
  });
});

describe('validateModifierGroup', () => {
  it('rejects a select range wider than the option list', () => {
    const doc = { ...ok(), minSelect: 2, maxSelect: 3 }; // chỉ có 2 option
    expect(validateModifierGroup(doc).some((e) => e.code === 'invalid_select_range')).toBe(true);
  });

  it('rejects minSelect > maxSelect and maxSelect 0 with options', () => {
    expect(
      validateModifierGroup({ ...ok(), minSelect: 2, maxSelect: 1 }).some(
        (e) => e.code === 'invalid_select_range',
      ),
    ).toBe(true);
    expect(
      validateModifierGroup({ ...ok(), minSelect: 0, maxSelect: 0 }).some(
        (e) => e.code === 'invalid_select_range',
      ),
    ).toBe(true);
  });

  it('rejects duplicate option ids and an empty option list', () => {
    const duplicate = option('trung', 5000);
    expect(
      validateModifierGroup({ ...ok(), options: [duplicate, duplicate] }).some(
        (e) => e.code === 'duplicate_option_id',
      ),
    ).toBe(true);
    expect(validateModifierGroup({ ...ok(), options: [] }).some((e) => e.code === 'empty_options')).toBe(
      true,
    );
  });

  it('rejects default selections that cannot satisfy the range', () => {
    // minSelect 2 mà chỉ có 1 option mặc định: khách không thể mở bàn với cấu hình hợp lệ.
    const doc = {
      ...ok(),
      minSelect: 2,
      maxSelect: 2,
      options: [option('a'), option('b'), option('c', 0, true)],
    };
    expect(validateModifierGroup(doc).some((e) => e.code === 'default_count_out_of_range')).toBe(true);
  });

  it('rejects a negative delta only when it breaks the Money shape, not the sign', () => {
    // Topping giảm giá là hợp lệ (bớt đá không đổi giá, nhưng "không lấy trứng" thì rẻ hơn).
    const doc = { ...ok(), options: [option('no-egg', -5000)] };
    expect(validateModifierGroup(doc)).toEqual([]);
  });
});
