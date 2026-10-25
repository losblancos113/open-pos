import { describe, it, expect } from 'vitest';
import {
  inventoryItemDocId,
  inventoryRecipeDocId,
  inventoryMovementDocId,
  supplierDocId,
  purchaseOrderDocId,
} from '../../db/ids';
import type {
  InventoryItemDoc,
  InventoryRecipeDoc,
  InventoryMovementDoc,
  SupplierDoc,
  PurchaseOrderDoc,
  MovementType,
  WasteReason,
  RecipeTargetType,
} from '../types';
import { money } from '../../money';

describe('Inventory ID helpers and core types', () => {
  it('formats inventoryItemDocId correctly', () => {
    expect(inventoryItemDocId('ing_coffee')).toBe('inventory_item:ing_coffee');
  });

  it('formats inventoryRecipeDocId correctly', () => {
    expect(inventoryRecipeDocId('product', 'prod_latte')).toBe('inventory_recipe:product:prod_latte');
    expect(inventoryRecipeDocId('modifier', 'opt_boba')).toBe('inventory_recipe:modifier:opt_boba');
    expect(inventoryRecipeDocId('variant', 'var_large')).toBe('inventory_recipe:variant:var_large');
  });

  it('formats inventoryMovementDocId correctly', () => {
    expect(inventoryMovementDocId('dist1', 'mov_001')).toBe('inventory_movement:dist1:mov_001');
  });

  it('formats supplierDocId and purchaseOrderDocId correctly', () => {
    expect(supplierDocId('sup_vinamilk')).toBe('supplier:sup_vinamilk');
    expect(purchaseOrderDocId('dist1', 'po_101')).toBe('purchase_order:dist1:po_101');
  });

  it('rejects colons or empty strings in segments', () => {
    expect(() => inventoryItemDocId('')).toThrow('itemId must be a non-empty string');
    expect(() => inventoryItemDocId('a:b')).toThrow('itemId must not contain ":"');
    expect(() => inventoryRecipeDocId('product', '')).toThrow('targetId must be a non-empty string');
    expect(() => inventoryMovementDocId('', 'm1')).toThrow('branchId must be a non-empty string');
  });

  it('supports well-typed document structures', () => {
    const item: InventoryItemDoc = {
      _id: inventoryItemDocId('ing_coffee'),
      branchId: '*',
      docType: 'inventory_item',
      schemaVersion: 1,
      itemId: 'ing_coffee',
      sku: 'CF-01',
      name: { vi: 'Cà phê', en: 'Coffee' },
      unit: 'g',
      costPerUnit: money(200, 'VND'),
      minThreshold: 500,
      active: true,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    expect(item.docType).toBe('inventory_item');

    const movementType: MovementType = 'sale_deduction';
    const wasteReason: WasteReason = 'expired';
    const targetType: RecipeTargetType = 'modifier';
    expect(movementType).toBe('sale_deduction');
    expect(wasteReason).toBe('expired');
    expect(targetType).toBe('modifier');
  });
});
