import { describe, it, expect } from 'vitest';
import { createWasteMovement } from '../waste';

describe('Waste Movement Tracking', () => {
  it('creates negative waste movement with valid wasteReason', () => {
    const waste = createWasteMovement({
      branchId: 'dist1',
      itemId: 'ing_milk',
      qty: 200,
      unit: 'ml',
      wasteReason: 'expired',
      note: 'Hộp sữa bị chua do để ngoài tủ lạnh',
      actorId: 'barista_01',
    });

    expect(waste.branchId).toBe('dist1');
    expect(waste.type).toBe('waste');
    expect(waste.itemId).toBe('ing_milk');
    expect(waste.qtyDelta).toBe(-200); // negative deduction
    expect(waste.wasteReason).toBe('expired');
    expect(waste.note).toBe('Hộp sữa bị chua do để ngoài tủ lạnh');
    expect(waste.actorId).toBe('barista_01');
  });

  it('rejects zero or negative waste quantity', () => {
    expect(() =>
      createWasteMovement({
        branchId: 'dist1',
        itemId: 'ing_milk',
        qty: 0,
        unit: 'ml',
        wasteReason: 'damaged',
        actorId: 'barista_01',
      }),
    ).toThrow('Waste quantity must be positive');

    expect(() =>
      createWasteMovement({
        branchId: 'dist1',
        itemId: 'ing_milk',
        qty: -10,
        unit: 'ml',
        wasteReason: 'damaged',
        actorId: 'barista_01',
      }),
    ).toThrow('Waste quantity must be positive');
  });

  it('rejects invalid wasteReason', () => {
    expect(() =>
      createWasteMovement({
        branchId: 'dist1',
        itemId: 'ing_milk',
        qty: 10,
        unit: 'ml',
        wasteReason: 'unsupported' as unknown as 'damaged',
        actorId: 'barista_01',
      }),
    ).toThrow('Invalid waste reason');
  });
});
