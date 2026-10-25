import { describe, it, expect } from 'vitest';
import { computeStockBalances, createMovementDoc } from '../movements';
import { createInventoryItemDoc } from '../item';
import { money } from '../../money';

describe('Materialized Stock Calculation & Movement Factory', () => {
  const coffee = createInventoryItemDoc({
    itemId: 'ing_coffee',
    sku: 'CF1',
    name: { vi: 'Cà phê', en: 'Coffee' },
    unit: 'g',
    costPerUnit: money(200, 'VND'),
    minThreshold: 500,
    now: '2026-10-25T00:00:00.000Z',
  });

  const milk = createInventoryItemDoc({
    itemId: 'ing_milk',
    sku: 'MLK1',
    name: { vi: 'Sữa tươi', en: 'Milk' },
    unit: 'ml',
    costPerUnit: money(30, 'VND'),
    minThreshold: 1000,
    now: '2026-10-25T00:00:00.000Z',
  });

  it('creates valid movement document with default UUID and timestamps', () => {
    const mov = createMovementDoc({
      branchId: 'dist1',
      type: 'purchase',
      itemId: 'ing_coffee',
      qtyDelta: 1000,
      unit: 'g',
      actorId: 'usr1',
      unitCost: money(200, 'VND'),
      createdAt: '2026-10-25T08:00:00.000Z',
    });

    expect(mov.docType).toBe('inventory_movement');
    expect(mov.branchId).toBe('dist1');
    expect(mov.type).toBe('purchase');
    expect(mov.itemId).toBe('ing_coffee');
    expect(mov.qtyDelta).toBe(1000);
    expect(mov._id).toMatch(/^inventory_movement:dist1:/);
    expect(mov.totalCost?.minor).toBe(200000); // 1000 * 200
  });

  it('computes stock balance correctly from multiple movements', () => {
    const movements = [
      createMovementDoc({
        movementId: 'm1',
        branchId: 'dist1',
        type: 'purchase',
        itemId: 'ing_coffee',
        qtyDelta: 1000,
        unit: 'g',
        actorId: 'user1',
        createdAt: '2026-10-25T08:00:00.000Z',
      }),
      createMovementDoc({
        movementId: 'm2',
        branchId: 'dist1',
        type: 'sale_deduction',
        itemId: 'ing_coffee',
        qtyDelta: -200,
        unit: 'g',
        actorId: 'pos_terminal',
        createdAt: '2026-10-25T09:00:00.000Z',
      }),
      createMovementDoc({
        movementId: 'm3',
        branchId: 'dist1',
        type: 'waste',
        itemId: 'ing_coffee',
        qtyDelta: -400,
        unit: 'g',
        wasteReason: 'damaged',
        actorId: 'user1',
        createdAt: '2026-10-25T10:00:00.000Z',
      }),
    ];

    const balances = computeStockBalances([coffee, milk], movements);

    const coffeeBalance = balances.get('ing_coffee');
    expect(coffeeBalance?.currentQty).toBe(400); // 1000 - 200 - 400
    expect(coffeeBalance?.isLowStock).toBe(true); // 400 <= 500
    expect(coffeeBalance?.lastMovementAt).toBe('2026-10-25T10:00:00.000Z');

    const milkBalance = balances.get('ing_milk');
    expect(milkBalance?.currentQty).toBe(0);
    expect(milkBalance?.isLowStock).toBe(true); // 0 <= 1000
    expect(milkBalance?.lastMovementAt).toBeUndefined();
  });

  it('flags isLowStock as false when stock is above minThreshold', () => {
    const movements = [
      createMovementDoc({
        movementId: 'm1',
        branchId: 'dist1',
        type: 'purchase',
        itemId: 'ing_coffee',
        qtyDelta: 2000,
        unit: 'g',
        actorId: 'user1',
      }),
    ];

    const balances = computeStockBalances([coffee], movements);
    const coffeeBalance = balances.get('ing_coffee');
    expect(coffeeBalance?.currentQty).toBe(2000);
    expect(coffeeBalance?.isLowStock).toBe(false); // 2000 > 500
  });

  it('supports negative stock without throwing', () => {
    const movements = [
      createMovementDoc({
        movementId: 'm1',
        branchId: 'dist1',
        type: 'sale_deduction',
        itemId: 'ing_coffee',
        qtyDelta: -100,
        unit: 'g',
        actorId: 'pos_terminal',
      }),
    ];

    const balances = computeStockBalances([coffee], movements);
    expect(balances.get('ing_coffee')?.currentQty).toBe(-100);
    expect(balances.get('ing_coffee')?.isLowStock).toBe(true);
  });
});
