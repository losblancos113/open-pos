import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { purchaseOrderDocId } from '../db/ids';
import { validateInventoryItem } from './item';
import { computeStockBalances, createMovementDoc } from './movements';
import { validateRecipe } from './recipe';
import type {
  InventoryItemDoc,
  InventoryMovementDoc,
  InventoryRecipeDoc,
  ItemStockBalance,
  PurchaseOrderDoc,
  SupplierDoc,
} from './types';

export interface InventoryRepository {
  saveItem(item: InventoryItemDoc): Promise<void>;
  getItems(): Promise<InventoryItemDoc[]>;
  getItem(itemId: string): Promise<InventoryItemDoc | null>;
  saveRecipe(recipe: InventoryRecipeDoc): Promise<void>;
  getRecipes(): Promise<InventoryRecipeDoc[]>;
  recordMovement(movement: InventoryMovementDoc): Promise<void>;
  recordMovements(movements: readonly InventoryMovementDoc[]): Promise<void>;
  getMovements(branchId: string): Promise<InventoryMovementDoc[]>;
  getStockBalances(branchId: string): Promise<Map<string, ItemStockBalance>>;
  saveSupplier(supplier: SupplierDoc): Promise<void>;
  getSuppliers(): Promise<SupplierDoc[]>;
  createPurchaseOrder(po: PurchaseOrderDoc): Promise<void>;
  getPurchaseOrders(branchId: string): Promise<PurchaseOrderDoc[]>;
  receivePurchaseOrder(branchId: string, poId: string, actorId: string): Promise<void>;
}

export function createInventoryRepository(adapter: DbAdapter): InventoryRepository {
  return {
    async saveItem(item: InventoryItemDoc): Promise<void> {
      validateInventoryItem(item);
      await adapter.put(item as unknown as DocEnvelope);
    },

    async getItems(): Promise<InventoryItemDoc[]> {
      const all = await adapter.allDocs({ includeGlobal: true });
      return all.filter(
        (doc) => (doc as unknown as InventoryItemDoc).docType === 'inventory_item' && !doc.deletedAt,
      ) as unknown as InventoryItemDoc[];
    },

    async getItem(itemId: string): Promise<InventoryItemDoc | null> {
      try {
        const doc = await adapter.get(`inventory_item:${itemId}`);
        if (!doc || doc.deletedAt) return null;
        return doc as unknown as InventoryItemDoc;
      } catch {
        return null;
      }
    },

    async saveRecipe(recipe: InventoryRecipeDoc): Promise<void> {
      validateRecipe(recipe);
      await adapter.put(recipe as unknown as DocEnvelope);
    },

    async getRecipes(): Promise<InventoryRecipeDoc[]> {
      const all = await adapter.allDocs({ includeGlobal: true });
      return all.filter(
        (doc) => (doc as unknown as InventoryRecipeDoc).docType === 'inventory_recipe' && !doc.deletedAt,
      ) as unknown as InventoryRecipeDoc[];
    },

    async recordMovement(movement: InventoryMovementDoc): Promise<void> {
      await adapter.put(movement as unknown as DocEnvelope);
    },

    async recordMovements(movements: readonly InventoryMovementDoc[]): Promise<void> {
      for (const m of movements) {
        await adapter.put(m as unknown as DocEnvelope);
      }
    },

    async getMovements(branchId: string): Promise<InventoryMovementDoc[]> {
      const all = await adapter.allDocs({ branchId });
      const filtered = all.filter(
        (doc) =>
          (doc as unknown as InventoryMovementDoc).docType === 'inventory_movement' &&
          (doc as unknown as InventoryMovementDoc).branchId === branchId &&
          !doc.deletedAt,
      ) as unknown as InventoryMovementDoc[];

      return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async getStockBalances(branchId: string): Promise<Map<string, ItemStockBalance>> {
      const [items, movements] = await Promise.all([
        this.getItems(),
        this.getMovements(branchId),
      ]);
      return computeStockBalances(items, movements);
    },

    async saveSupplier(supplier: SupplierDoc): Promise<void> {
      await adapter.put(supplier as unknown as DocEnvelope);
    },

    async getSuppliers(): Promise<SupplierDoc[]> {
      const all = await adapter.allDocs({ includeGlobal: true });
      return all.filter(
        (doc) => (doc as unknown as SupplierDoc).docType === 'supplier' && !doc.deletedAt,
      ) as unknown as SupplierDoc[];
    },

    async createPurchaseOrder(po: PurchaseOrderDoc): Promise<void> {
      await adapter.put(po as unknown as DocEnvelope);
    },

    async getPurchaseOrders(branchId: string): Promise<PurchaseOrderDoc[]> {
      const all = await adapter.allDocs({ branchId });
      return all.filter(
        (doc) =>
          (doc as unknown as PurchaseOrderDoc).docType === 'purchase_order' &&
          (doc as unknown as PurchaseOrderDoc).branchId === branchId &&
          !doc.deletedAt,
      ) as unknown as PurchaseOrderDoc[];
    },

    async receivePurchaseOrder(branchId: string, poId: string, actorId: string): Promise<void> {
      const docId = purchaseOrderDocId(branchId, poId);
      const rawDoc = await adapter.get(docId);
      if (!rawDoc || rawDoc.deletedAt) {
        throw new Error(`Purchase order not found: ${poId}`);
      }

      const po = rawDoc as unknown as PurchaseOrderDoc;
      if (po.status === 'received') {
        return; // idempotent
      }

      const now = new Date().toISOString();

      // Emit movements for each line in the PO
      for (const item of po.items) {
        const movement = createMovementDoc({
          branchId,
          type: 'purchase',
          itemId: item.itemId,
          qtyDelta: item.qty,
          unit: item.unit,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          refId: po.poId,
          actorId,
          createdAt: now,
        });
        await adapter.put(movement as unknown as DocEnvelope);
      }

      const updatedPo: PurchaseOrderDoc = {
        ...po,
        status: 'received',
        receivedAt: now,
        updatedAt: now,
        ...(rawDoc._rev ? { _rev: rawDoc._rev } : {}),
      };

      await adapter.put(updatedPo as unknown as DocEnvelope);
    },
  };
}
