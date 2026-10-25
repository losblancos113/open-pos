import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createInventoryRepository } from '@/core/inventory/inventory-repository';
import { createInventoryItemDoc } from '@/core/inventory/item';
import { createRecipeDoc } from '@/core/inventory/recipe';
import { money } from '@/core/money';
import { useInventory } from '../use-inventory';
import { supplierDocId, purchaseOrderDocId } from '@/core/db/ids';

describe('useInventory composable', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let repo: ReturnType<typeof createInventoryRepository>;
  const activeBranchId = ref('dist1');

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createInventoryRepository(adapter);
  });

  it('initializes and computes stock balances and low stock alerts reactively', async () => {
    // 1. Seed items
    await repo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_coffee',
        sku: 'CF-01',
        name: { vi: 'Hạt cà phê', en: 'Coffee' },
        unit: 'g',
        costPerUnit: money(200, 'VND'),
        minThreshold: 500,
      }),
    );
    await repo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_sugar',
        sku: 'SG-01',
        name: { vi: 'Đường cát', en: 'Sugar' },
        unit: 'g',
        costPerUnit: money(20, 'VND'),
        minThreshold: 200,
      }),
    );

    // Initial movement for coffee: 400g (below minThreshold 500g -> low stock)
    await repo.recordMovement({
      _id: 'inventory_movement:dist1:m1',
      branchId: 'dist1',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'm1',
      type: 'purchase',
      itemId: 'ing_coffee',
      qtyDelta: 400,
      unit: 'g',
      actorId: 'usr1',
      createdAt: '2026-10-25T08:00:00.000Z',
    });

    const inventory = useInventory(repo, activeBranchId);
    await inventory.refresh();

    expect(inventory.items.value).toHaveLength(2);
    expect(inventory.balances.value.get('ing_coffee')?.currentQty).toBe(400);
    expect(inventory.lowStockCount.value).toBe(2); // Coffee (400 <= 500) and Sugar (0 <= 200)

    const coffeeAlert = inventory.lowStockItems.value.find((i) => i.item.itemId === 'ing_coffee');
    expect(coffeeAlert).toBeDefined();
    expect(coffeeAlert?.balance.currentQty).toBe(400);
  });

  it('records waste and immediately updates stock balance', async () => {
    await repo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_milk',
        sku: 'MK-01',
        name: { vi: 'Sữa tươi', en: 'Milk' },
        unit: 'ml',
        costPerUnit: money(30, 'VND'),
        minThreshold: 100,
      }),
    );

    // Initial stock: 1000ml
    await repo.recordMovement({
      _id: 'inventory_movement:dist1:init_milk',
      branchId: 'dist1',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'init_milk',
      type: 'purchase',
      itemId: 'ing_milk',
      qtyDelta: 1000,
      unit: 'ml',
      actorId: 'usr1',
      createdAt: '2026-10-25T08:00:00.000Z',
    });

    const inventory = useInventory(repo, activeBranchId);
    await inventory.refresh();
    expect(inventory.balances.value.get('ing_milk')?.currentQty).toBe(1000);

    // Record 200ml expired waste
    await inventory.recordWaste({
      itemId: 'ing_milk',
      qty: 200,
      unit: 'ml',
      wasteReason: 'expired',
      note: 'Hết hạn sử dụng',
      actorId: 'barista_01',
    });

    expect(inventory.balances.value.get('ing_milk')?.currentQty).toBe(800);
    expect(inventory.movements.value.some((m) => m.type === 'waste')).toBe(true);
  });

  it('submits stocktake counts and reconciles discrepancy movements', async () => {
    await repo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_tea',
        sku: 'TEA-01',
        name: { vi: 'Trà xanh', en: 'Green Tea' },
        unit: 'g',
        costPerUnit: money(100, 'VND'),
        minThreshold: 50,
      }),
    );

    // Initial stock: 500g
    await repo.recordMovement({
      _id: 'inventory_movement:dist1:init_tea',
      branchId: 'dist1',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'init_tea',
      type: 'purchase',
      itemId: 'ing_tea',
      qtyDelta: 500,
      unit: 'g',
      actorId: 'usr1',
      createdAt: '2026-10-25T08:00:00.000Z',
    });

    const inventory = useInventory(repo, activeBranchId);
    await inventory.refresh();

    // Actual count is 470g (30g discrepancy)
    await inventory.submitStocktake(
      [{ itemId: 'ing_tea', countedQty: 470, unit: 'g' }],
      'manager_01',
    );

    expect(inventory.balances.value.get('ing_tea')?.currentQty).toBe(470);
    const stocktakeMov = inventory.movements.value.find((m) => m.type === 'stocktake');
    expect(stocktakeMov).toBeDefined();
    expect(stocktakeMov?.qtyDelta).toBe(-30);
  });
});
