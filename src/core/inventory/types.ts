import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';

export interface InventoryItemDoc {
  readonly _id: string; // inventory_item:<itemId>
  readonly branchId: string; // GLOBAL_BRANCH_ID ('*') or specific branch
  readonly docType: 'inventory_item';
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly sku: string;
  readonly barcode?: string;
  readonly name: LocalizedText;
  readonly unit: string; // 'g' | 'ml' | 'piece' | 'can' | 'kg' | 'pack'
  readonly costPerUnit: Money;
  readonly minThreshold: number; // minimum stock level before warning
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly _rev?: string;
}

export interface CreateInventoryItemInput {
  readonly itemId: string;
  readonly sku: string;
  readonly barcode?: string;
  readonly name: LocalizedText;
  readonly unit: string;
  readonly costPerUnit: Money;
  readonly minThreshold?: number;
  readonly branchId?: string;
  readonly active?: boolean;
  readonly now?: string;
}

export type RecipeTargetType = 'product' | 'variant' | 'modifier';

export interface RecipeIngredient {
  readonly itemId: string;
  readonly qty: number; // quantity in base unit of ingredient (e.g. 20 for 20g)
  readonly unit: string;
}

export interface InventoryRecipeDoc {
  readonly _id: string; // inventory_recipe:<targetType>:<targetId>
  readonly branchId: string; // GLOBAL_BRANCH_ID ('*')
  readonly docType: 'inventory_recipe';
  readonly schemaVersion: 1;
  readonly recipeId: string;
  readonly targetType: RecipeTargetType;
  readonly targetId: string; // productId, variantId, or modifier optionId
  readonly yieldQty: number; // portions produced (default 1)
  readonly ingredients: readonly RecipeIngredient[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly _rev?: string;
}

export interface CreateRecipeInput {
  readonly recipeId: string;
  readonly targetType: RecipeTargetType;
  readonly targetId: string;
  readonly yieldQty?: number;
  readonly ingredients: readonly RecipeIngredient[];
  readonly branchId?: string;
  readonly now?: string;
}

export type MovementType =
  | 'purchase'
  | 'sale_deduction'
  | 'waste'
  | 'adjust'
  | 'stocktake';

export type WasteReason =
  | 'expired'
  | 'damaged'
  | 'burnt_mistake'
  | 'quality_reject'
  | 'staff_meal'
  | 'other';

export interface InventoryMovementDoc {
  readonly _id: string; // inventory_movement:<branchId>:<movementId>
  readonly branchId: string;
  readonly docType: 'inventory_movement';
  readonly schemaVersion: 1;
  readonly movementId: string;
  readonly type: MovementType;
  readonly itemId: string;
  readonly qtyDelta: number; // positive = stock in, negative = stock out
  readonly unit: string;
  readonly unitCost?: Money;
  readonly totalCost?: Money;
  readonly refId?: string; // billId, poId, stocktakeId
  readonly wasteReason?: WasteReason;
  readonly note?: string;
  readonly actorId: string;
  readonly createdAt: string;
  readonly _rev?: string;
}

export interface CreateMovementInput {
  readonly movementId?: string;
  readonly branchId: string;
  readonly type: MovementType;
  readonly itemId: string;
  readonly qtyDelta: number;
  readonly unit: string;
  readonly unitCost?: Money;
  readonly totalCost?: Money;
  readonly refId?: string;
  readonly wasteReason?: WasteReason;
  readonly note?: string;
  readonly actorId: string;
  readonly createdAt?: string;
}

export interface ItemStockBalance {
  readonly itemId: string;
  currentQty: number;
  readonly unit: string;
  readonly minThreshold: number;
  isLowStock: boolean;
  lastMovementAt?: string;
}

export interface SupplierDoc {
  readonly _id: string; // supplier:<supplierId>
  readonly branchId: string; // GLOBAL_BRANCH_ID ('*')
  readonly docType: 'supplier';
  readonly schemaVersion: 1;
  readonly supplierId: string;
  readonly name: string;
  readonly contactName?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly taxCode?: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly _rev?: string;
}

export interface CreateSupplierInput {
  readonly supplierId: string;
  readonly name: string;
  readonly contactName?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly taxCode?: string;
  readonly active?: boolean;
  readonly now?: string;
}

export interface PurchaseOrderItem {
  readonly itemId: string;
  readonly qty: number;
  readonly unit: string;
  readonly unitCost: Money;
  readonly totalCost: Money;
}

export interface PurchaseOrderDoc {
  readonly _id: string; // purchase_order:<branchId>:<poId>
  readonly branchId: string;
  readonly docType: 'purchase_order';
  readonly schemaVersion: 1;
  readonly poId: string;
  readonly poNumber: string; // e.g. "PO-HQ-20261025-001"
  readonly supplierId: string;
  readonly supplierName: string;
  readonly items: readonly PurchaseOrderItem[];
  readonly totalAmount: Money;
  readonly status: 'draft' | 'received';
  readonly receivedAt?: string;
  readonly actorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly _rev?: string;
}

export interface CreatePurchaseOrderInput {
  readonly poId: string;
  readonly branchId: string;
  readonly poNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly items: readonly PurchaseOrderItem[];
  readonly totalAmount: Money;
  readonly status?: 'draft' | 'received';
  readonly actorId: string;
  readonly now?: string;
}
