import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createInventoryRepository } from '../inventory-repository';
import { createInventoryItemDoc } from '../item';
import { createRecipeDoc } from '../recipe';
import { money } from '../../money';
import { supplierDocId, purchaseOrderDocId } from '../../db/ids';
import type { SupplierDoc, PurchaseOrderDoc } from '../types';

describe('Inventory Repository', () => {
  let repo: ReturnType<typeof createInventoryRepository>;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    repo = createInventoryRepository(adapter);
  });

  it('saves items and recipes and retrieves them', async () => {
    const item = createInventoryItemDoc({
      itemId: 'ing_tea',
      sku: 'TEA1',
      name: { vi: 'Trà Oolong', en: 'Oolong Tea' },
      unit: 'g',
      costPerUnit: money(150, 'VND'),
      minThreshold: 200,
      now: '2026-10-25T00:00:00.000Z',
    });

    await repo.saveItem(item);
    const items = await repo.getItems();
    expect(items).toHaveLength(1);
    expect(items[0]?.itemId).toBe('ing_tea');

    const recipe = createRecipeDoc({
      recipeId: 'rec_tea',
      targetType: 'product',
      targetId: 'prod_tea',
      ingredients: [{ itemId: 'ing_tea', qty: 15, unit: 'g' }],
      now: '2026-10-25T00:00:00.000Z',
    });

    await repo.saveRecipe(recipe);
    const recipes = await repo.getRecipes();
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.recipeId).toBe('rec_tea');
  });

  it('records purchase movement and materializes positive stock for a branch', async () => {
    const item = createInventoryItemDoc({
      itemId: 'ing_tea',
      sku: 'TEA1',
      name: { vi: 'Trà Oolong', en: 'Oolong Tea' },
      unit: 'g',
      costPerUnit: money(150, 'VND'),
      minThreshold: 200,
      now: '2026-10-25T00:00:00.000Z',
    });
    await repo.saveItem(item);

    await repo.recordMovement({
      _id: 'inventory_movement:dist1:mov1',
      branchId: 'dist1',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'mov1',
      type: 'purchase',
      itemId: 'ing_tea',
      qtyDelta: 500,
      unit: 'g',
      actorId: 'usr1',
      createdAt: '2026-10-25T08:00:00.000Z',
    });

    const dist1Balances = await repo.getStockBalances('dist1');
    expect(dist1Balances.get('ing_tea')?.currentQty).toBe(500);
    expect(dist1Balances.get('ing_tea')?.isLowStock).toBe(false);

    // Another branch has 0 movements -> 0 balance
    const hqBalances = await repo.getStockBalances('hq');
    expect(hqBalances.get('ing_tea')?.currentQty).toBe(0);
    expect(hqBalances.get('ing_tea')?.isLowStock).toBe(true);
  });

  it('records suppliers and handles purchase order receiving', async () => {
    const supplier: SupplierDoc = {
      _id: supplierDocId('sup_da_lat'),
      branchId: '*',
      docType: 'supplier',
      schemaVersion: 1,
      supplierId: 'sup_da_lat',
      name: 'Nông trại Đà Lạt',
      contactName: 'Anh Nam',
      phone: '0901234567',
      active: true,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    await repo.saveSupplier(supplier);
    const suppliers = await repo.getSuppliers();
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0]?.name).toBe('Nông trại Đà Lạt');

    const item = createInventoryItemDoc({
      itemId: 'ing_strawberry',
      sku: 'STR1',
      name: { vi: 'Dâu tây', en: 'Strawberry' },
      unit: 'kg',
      costPerUnit: money(120000, 'VND'),
      minThreshold: 10,
    });
    await repo.saveItem(item);

    const po: PurchaseOrderDoc = {
      _id: purchaseOrderDocId('dist1', 'po_01'),
      branchId: 'dist1',
      docType: 'purchase_order',
      schemaVersion: 1,
      poId: 'po_01',
      poNumber: 'PO-D1-001',
      supplierId: 'sup_da_lat',
      supplierName: 'Nông trại Đà Lạt',
      items: [
        {
          itemId: 'ing_strawberry',
          qty: 25,
          unit: 'kg',
          unitCost: money(120000, 'VND'),
          totalCost: money(3000000, 'VND'),
        },
      ],
      totalAmount: money(3000000, 'VND'),
      status: 'draft',
      actorId: 'mgr_01',
      createdAt: '2026-10-25T09:00:00.000Z',
      updatedAt: '2026-10-25T09:00:00.000Z',
    };
    await repo.createPurchaseOrder(po);

    const pos = await repo.getPurchaseOrders('dist1');
    expect(pos).toHaveLength(1);
    expect(pos[0]?.status).toBe('draft');

    // Receiving the purchase order emits purchase movement and updates PO status
    await repo.receivePurchaseOrder('dist1', 'po_01', 'mgr_01');

    const updatedPos = await repo.getPurchaseOrders('dist1');
    expect(updatedPos[0]?.status).toBe('received');
    expect(updatedPos[0]?.receivedAt).toBeDefined();

    const balances = await repo.getStockBalances('dist1');
    expect(balances.get('ing_strawberry')?.currentQty).toBe(25);
  });
});
