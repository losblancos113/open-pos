import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import type { ComboDoc, ComboGroup, ComboOption } from '../combo';
import { createComboDoc, validateCombo } from '../combo';

const NOW = '2026-10-22T09:00:00.000Z';

function option(optionId: string, productId: string, delta = 0): ComboOption {
  return { optionId, productId, priceDelta: money(delta, 'VND') };
}

function group(key: string, over: Partial<ComboGroup> = {}): ComboGroup {
  return {
    key,
    label: { vi: `Nhóm ${key}`, en: `Group ${key}` },
    minSelect: 1,
    maxSelect: 1,
    options: [option(`opt:${key}`, `product:${key}`)],
    ...over,
  };
}

function ok(): ComboDoc {
  return createComboDoc({
    id: 'com-trua',
    name: { vi: 'Cơm trưa', en: 'Lunch set' },
    basePrice: money(55000, 'VND'),
    comboGroups: [group('main'), group('drink')],
    now: NOW,
  });
}

describe('createComboDoc', () => {
  it('builds the spec combo example', () => {
    const doc = createComboDoc({
      id: 'com-trua',
      name: { vi: 'Cơm trưa', en: 'Lunch set' },
      basePrice: money(55000, 'VND'),
      comboGroups: [
        {
          key: 'main',
          label: { vi: 'Món chính', en: 'Main' },
          minSelect: 1,
          maxSelect: 1,
          options: [
            option('opt:pho', 'product:pho-bo'),
            option('opt:com', 'product:com-ga', 5000),
          ],
        },
        {
          key: 'drink',
          label: { vi: 'Nước', en: 'Drink' },
          minSelect: 1,
          maxSelect: 1,
          options: [option('opt:tra', 'product:tra-da')],
        },
      ],
      now: NOW,
    });

    expect(doc._id).toBe('combo:com-trua');
    expect(doc.docType).toBe('catalog_combo');
    expect(doc.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(doc.categoryId).toBeNull();
    expect(doc.imageRef).toBeNull();
    expect(doc.sortOrder).toBe(0);
    expect(doc.isActive).toBe(true);
    expect(validateCombo(doc)).toEqual([]);
  });
});

describe('validateCombo', () => {
  it('rejects duplicate group keys', () => {
    const doc = { ...ok(), comboGroups: [group('main'), group('main')] };
    expect(validateCombo(doc).some((e) => e.code === 'duplicate_group_key')).toBe(true);
  });

  it('rejects duplicate option ids anywhere in the combo', () => {
    // Bill line tham chiếu option theo `optionId`, nên trùng id giữa hai nhóm là mơ hồ.
    const doc = {
      ...ok(),
      comboGroups: [group('main'), group('drink', { options: [option('opt:main', 'product:tra-da')] })],
    };
    expect(validateCombo(doc).some((e) => e.code === 'duplicate_option_id')).toBe(true);
  });

  it('rejects an empty group list and a group with no options', () => {
    expect(validateCombo({ ...ok(), comboGroups: [] }).some((e) => e.code === 'empty_groups')).toBe(true);
    expect(
      validateCombo({ ...ok(), comboGroups: [group('main', { options: [] })] }).some(
        (e) => e.code === 'empty_options',
      ),
    ).toBe(true);
  });

  it('rejects a group whose range cannot be satisfied', () => {
    const withRange = (minSelect: number, maxSelect: number) => ({
      ...ok(),
      comboGroups: [group('main', { minSelect, maxSelect })],
    });

    expect(validateCombo(withRange(2, 1)).some((e) => e.code === 'invalid_select_range')).toBe(true);
    expect(validateCombo(withRange(0, 0)).some((e) => e.code === 'invalid_select_range')).toBe(true);
    expect(validateCombo(withRange(1, 3)).some((e) => e.code === 'invalid_select_range')).toBe(true);
  });

  it('rejects an option that does not point at a product', () => {
    const doc = { ...ok(), comboGroups: [group('main', { options: [option('opt:x', 'combo:other')] })] };
    expect(validateCombo(doc).some((e) => e.code === 'invalid_reference')).toBe(true);
  });
});
