import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createOrderRepository } from '../order-repository';
import { createInventoryRepository } from '../../inventory/inventory-repository';
import { createInventoryItemDoc } from '../../inventory/item';
import { createRecipeDoc } from '../../inventory/recipe';
import { money } from '../../money';

describe('Order Settlement Inventory Deduction Integration', () => {
  it('automatically triggers ingredient deduction when bill is paid', async () => {
    const adapter = await createMemoryAdapter();
    const inventoryRepo = createInventoryRepository(adapter);
    const orderRepo = createOrderRepository({ adapter, inventoryRepo });

    // 1. Seed item & recipe
    await inventoryRepo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_beans',
        sku: 'BN1',
        name: { vi: 'Hạt cà phê', en: 'Coffee Beans' },
        unit: 'g',
        costPerUnit: money(200, 'VND'),
        minThreshold: 100,
        now: '2026-10-25T00:00:00.000Z',
      }),
    );
    await inventoryRepo.saveRecipe(
      createRecipeDoc({
        recipeId: 'rec_cf',
        targetType: 'product',
        targetId: 'prod_cf',
        ingredients: [{ itemId: 'ing_beans', qty: 20, unit: 'g' }],
        now: '2026-10-25T00:00:00.000Z',
      }),
    );

    // Initial stock: 100g
    await inventoryRepo.recordMovement({
      _id: 'inventory_movement:hq:init',
      branchId: 'hq',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'init',
      type: 'purchase',
      itemId: 'ing_beans',
      qtyDelta: 100,
      unit: 'g',
      actorId: 'admin',
      createdAt: '2026-10-25T07:00:00.000Z',
    });

    // 2. Open session, add 2 coffees, pay bill
    await orderRepo.appendEvents('hq', 's1', [
      {
        eventId: 'e1',
        type: 'SESSION_OPENED',
        sessionId: 's1',
        billId: 'b1',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: { tableIds: ['t1'], openedAt: '2026-10-25T08:00:00.000Z' },
        createdAt: '2026-10-25T08:00:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'e2',
        type: 'LINE_ADDED',
        sessionId: 's1',
        billId: 'b1',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: {
          lineId: 'l1',
          productId: 'prod_cf',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 2,
        },
        createdAt: '2026-10-25T08:01:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'e3',
        type: 'PAYMENT_ADDED',
        sessionId: 's1',
        billId: 'b1',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: {
          paymentId: 'p1',
          method: 'cash',
          amount: money(60000, 'VND'),
          tendered: money(60000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-25T08:05:00.000Z',
        },
        createdAt: '2026-10-25T08:05:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // Check stock: 100g - (20g * 2) = 60g
    const balances = await inventoryRepo.getStockBalances('hq');
    expect(balances.get('ing_beans')?.currentQty).toBe(60);
  });

  it('guarantees idempotency on duplicate settlement evaluation', async () => {
    const adapter = await createMemoryAdapter();
    const inventoryRepo = createInventoryRepository(adapter);
    const orderRepo = createOrderRepository({ adapter, inventoryRepo });

    await inventoryRepo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_beans',
        sku: 'BN1',
        name: { vi: 'Hạt cà phê', en: 'Coffee Beans' },
        unit: 'g',
        costPerUnit: money(200, 'VND'),
      }),
    );
    await inventoryRepo.saveRecipe(
      createRecipeDoc({
        recipeId: 'rec_cf',
        targetType: 'product',
        targetId: 'prod_cf',
        ingredients: [{ itemId: 'ing_beans', qty: 25, unit: 'g' }],
      }),
    );

    // Initial stock: 100g
    await inventoryRepo.recordMovement({
      _id: 'inventory_movement:hq:init2',
      branchId: 'hq',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'init2',
      type: 'purchase',
      itemId: 'ing_beans',
      qtyDelta: 100,
      unit: 'g',
      actorId: 'admin',
      createdAt: '2026-10-25T07:00:00.000Z',
    });

    const events = [
      {
        eventId: 'e10',
        type: 'SESSION_OPENED' as const,
        sessionId: 's2',
        billId: 'b2',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: { tableIds: ['t1'], openedAt: '2026-10-25T08:00:00.000Z' },
        createdAt: '2026-10-25T08:00:00.000Z',
        schemaVersion: 1 as const,
      },
      {
        eventId: 'e11',
        type: 'LINE_ADDED' as const,
        sessionId: 's2',
        billId: 'b2',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: {
          lineId: 'l10',
          productId: 'prod_cf',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 1,
        },
        createdAt: '2026-10-25T08:01:00.000Z',
        schemaVersion: 1 as const,
      },
      {
        eventId: 'e12',
        type: 'PAYMENT_ADDED' as const,
        sessionId: 's2',
        billId: 'b2',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: {
          paymentId: 'p2',
          method: 'cash' as const,
          amount: money(30000, 'VND'),
          tendered: money(30000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-25T08:05:00.000Z',
        },
        createdAt: '2026-10-25T08:05:00.000Z',
        schemaVersion: 1 as const,
      },
    ];

    await orderRepo.appendEvents('hq', 's2', events);

    // Call appendEvents again with BILL_CLOSED
    await orderRepo.appendEvents('hq', 's2', [
      {
        eventId: 'e13',
        type: 'BILL_CLOSED',
        sessionId: 's2',
        billId: 'b2',
        actorId: 'usr1',
        deviceId: 'd1',
        payload: { closedAt: '2026-10-25T08:06:00.000Z' },
        createdAt: '2026-10-25T08:06:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // Stock should be 100g - 25g = 75g (NOT 50g!)
    const balances = await inventoryRepo.getStockBalances('hq');
    expect(balances.get('ing_beans')?.currentQty).toBe(75);
  });
});
