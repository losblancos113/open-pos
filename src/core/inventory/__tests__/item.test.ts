import { describe, it, expect } from 'vitest';
import { createInventoryItemDoc, validateInventoryItem } from '../item';
import { money } from '../../money';

describe('Inventory Item Factory & Validation', () => {
  it('creates a valid InventoryItemDoc with default values', () => {
    const doc = createInventoryItemDoc({
      itemId: 'ing_coffee_beans',
      sku: 'ING-CF-01',
      name: { vi: 'Hạt cà phê Robusta', en: 'Robusta Coffee Beans' },
      unit: 'g',
      costPerUnit: money(250, 'VND'),
      minThreshold: 1000,
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc._id).toBe('inventory_item:ing_coffee_beans');
    expect(doc.branchId).toBe('*');
    expect(doc.unit).toBe('g');
    expect(doc.costPerUnit.minor).toBe(250);
    expect(doc.minThreshold).toBe(1000);
    expect(doc.active).toBe(true);
    expect(doc.createdAt).toBe('2026-10-25T10:00:00.000Z');
    expect(doc.updatedAt).toBe('2026-10-25T10:00:00.000Z');
  });

  it('supports branch-specific items when branchId is explicitly passed', () => {
    const doc = createInventoryItemDoc({
      itemId: 'ing_fresh_mint',
      sku: 'ING-MINT-01',
      name: { vi: 'Lá bạc hà', en: 'Mint Leaves' },
      unit: 'g',
      costPerUnit: money(50, 'VND'),
      branchId: 'dist1',
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc.branchId).toBe('dist1');
    expect(doc.minThreshold).toBe(0); // default threshold
  });

  it('rejects empty or invalid itemId, sku, and unit', () => {
    expect(() =>
      createInventoryItemDoc({
        itemId: '',
        sku: 'SKU1',
        name: { vi: 'Muối', en: 'Salt' },
        unit: 'g',
        costPerUnit: money(10, 'VND'),
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('itemId must be a non-empty string');

    expect(() =>
      createInventoryItemDoc({
        itemId: 'ing_1',
        sku: '   ',
        name: { vi: 'Muối', en: 'Salt' },
        unit: 'g',
        costPerUnit: money(10, 'VND'),
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('sku must be a non-empty string');

    expect(() =>
      createInventoryItemDoc({
        itemId: 'ing_1',
        sku: 'SKU1',
        name: { vi: 'Muối', en: 'Salt' },
        unit: '',
        costPerUnit: money(10, 'VND'),
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('unit must be a non-empty string');
  });

  it('rejects negative minThreshold', () => {
    expect(() =>
      createInventoryItemDoc({
        itemId: 'ing_2',
        sku: 'SKU2',
        name: { vi: 'Đường', en: 'Sugar' },
        unit: 'g',
        costPerUnit: money(10, 'VND'),
        minThreshold: -5,
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('minThreshold must be non-negative');
  });

  it('validates an existing doc successfully', () => {
    const doc = createInventoryItemDoc({
      itemId: 'ing_milk',
      sku: 'ING-MK-01',
      name: { vi: 'Sữa đặc', en: 'Condensed Milk' },
      unit: 'ml',
      costPerUnit: money(120, 'VND'),
      minThreshold: 500,
    });

    expect(() => validateInventoryItem(doc)).not.toThrow();
  });
});
