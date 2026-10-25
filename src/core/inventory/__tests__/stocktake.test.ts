import { describe, it, expect } from 'vitest';
import { calculateStocktakeAdjustments } from '../stocktake';
import type { ItemStockBalance } from '../types';

describe('Stocktake Reconciliation', () => {
  const balances = new Map<string, ItemStockBalance>([
    [
      'ing_coffee',
      {
        itemId: 'ing_coffee',
        currentQty: 500,
        unit: 'g',
        minThreshold: 100,
        isLowStock: false,
      },
    ],
    [
      'ing_sugar',
      {
        itemId: 'ing_sugar',
        currentQty: 200,
        unit: 'g',
        minThreshold: 50,
        isLowStock: false,
      },
    ],
    [
      'ing_milk',
      {
        itemId: 'ing_milk',
        currentQty: 1000,
        unit: 'ml',
        minThreshold: 200,
        isLowStock: false,
      },
    ],
  ]);

  it('emits stocktake adjust movements for discrepancies only', () => {
    const physicalCounts = [
      { itemId: 'ing_coffee', countedQty: 480, unit: 'g' }, // loss of 20g (-20)
      { itemId: 'ing_sugar', countedQty: 200, unit: 'g' }, // exact match (0)
      { itemId: 'ing_milk', countedQty: 1050, unit: 'ml' }, // surplus of 50ml (+50)
    ];

    const adjustments = calculateStocktakeAdjustments(
      balances,
      physicalCounts,
      'dist1',
      'mgr_01',
      'stk_01',
    );

    expect(adjustments).toHaveLength(2);

    const coffeeAdj = adjustments.find((a) => a.itemId === 'ing_coffee');
    expect(coffeeAdj?.qtyDelta).toBe(-20);
    expect(coffeeAdj?.type).toBe('stocktake');
    expect(coffeeAdj?.refId).toBe('stk_01');
    expect(coffeeAdj?.branchId).toBe('dist1');
    expect(coffeeAdj?.actorId).toBe('mgr_01');

    const milkAdj = adjustments.find((a) => a.itemId === 'ing_milk');
    expect(milkAdj?.qtyDelta).toBe(50);
    expect(milkAdj?.type).toBe('stocktake');
    expect(milkAdj?.refId).toBe('stk_01');
  });

  it('handles counted items not present in previous balances as new stock', () => {
    const physicalCounts = [
      { itemId: 'ing_vanilla', countedQty: 300, unit: 'ml' },
    ];

    const adjustments = calculateStocktakeAdjustments(
      balances,
      physicalCounts,
      'dist1',
      'mgr_01',
      'stk_02',
    );

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.itemId).toBe('ing_vanilla');
    expect(adjustments[0]?.qtyDelta).toBe(300); // 300 - 0 = +300
  });

  it('rejects negative counted quantities', () => {
    expect(() =>
      calculateStocktakeAdjustments(
        balances,
        [{ itemId: 'ing_coffee', countedQty: -10, unit: 'g' }],
        'dist1',
        'mgr_01',
        'stk_03',
      ),
    ).toThrow('Counted quantity cannot be negative');
  });
});
