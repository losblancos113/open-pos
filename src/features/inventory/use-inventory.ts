import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import type { InventoryRepository } from '@/core/inventory/inventory-repository';
import type {
  InventoryItemDoc,
  InventoryMovementDoc,
  InventoryRecipeDoc,
  ItemStockBalance,
  PurchaseOrderDoc,
  SupplierDoc,
  WasteReason,
} from '@/core/inventory/types';
import { createMovementDoc } from '@/core/inventory/movements';
import { createWasteMovement } from '@/core/inventory/waste';
import { calculateStocktakeAdjustments, type PhysicalCountItem } from '@/core/inventory/stocktake';

export interface UseInventoryResult {
  items: Ref<InventoryItemDoc[]>;
  recipes: Ref<InventoryRecipeDoc[]>;
  movements: Ref<InventoryMovementDoc[]>;
  suppliers: Ref<SupplierDoc[]>;
  purchaseOrders: Ref<PurchaseOrderDoc[]>;
  balances: Ref<Map<string, ItemStockBalance>>;
  lowStockItems: ComputedRef<Array<{ item: InventoryItemDoc; balance: ItemStockBalance }>>;
  lowStockCount: ComputedRef<number>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
  recordWaste: (input: {
    itemId: string;
    qty: number;
    unit: string;
    wasteReason: WasteReason;
    note?: string;
    actorId: string;
  }) => Promise<void>;
  submitStocktake: (counts: readonly PhysicalCountItem[], actorId: string) => Promise<void>;
  receivePurchaseOrder: (poId: string, actorId: string) => Promise<void>;
  saveItem: (item: InventoryItemDoc) => Promise<void>;
  saveRecipe: (recipe: InventoryRecipeDoc) => Promise<void>;
  saveSupplier: (supplier: SupplierDoc) => Promise<void>;
  createPurchaseOrder: (po: PurchaseOrderDoc) => Promise<void>;
}

export function useInventory(
  repo: InventoryRepository,
  branchId: MaybeRefOrGetter<string>,
): UseInventoryResult {
  const items = ref<InventoryItemDoc[]>([]);
  const recipes = ref<InventoryRecipeDoc[]>([]);
  const movements = ref<InventoryMovementDoc[]>([]);
  const suppliers = ref<SupplierDoc[]>([]);
  const purchaseOrders = ref<PurchaseOrderDoc[]>([]);
  const balances = ref<Map<string, ItemStockBalance>>(new Map());
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const lowStockItems = computed(() => {
    const results: Array<{ item: InventoryItemDoc; balance: ItemStockBalance }> = [];
    for (const item of items.value) {
      const bal = balances.value.get(item.itemId);
      if (bal && bal.isLowStock) {
        results.push({ item, balance: bal });
      }
    }
    return results;
  });

  const lowStockCount = computed(() => lowStockItems.value.length);

  async function refresh(): Promise<void> {
    const curBranch = toValue(branchId);
    isLoading.value = true;
    error.value = null;

    try {
      const [allItms, allRcps, allMovs, allSups, allPos, allBals] = await Promise.all([
        repo.getItems(),
        repo.getRecipes(),
        repo.getMovements(curBranch),
        repo.getSuppliers(),
        repo.getPurchaseOrders(curBranch),
        repo.getStockBalances(curBranch),
      ]);

      items.value = allItms;
      recipes.value = allRcps;
      movements.value = allMovs;
      suppliers.value = allSups;
      purchaseOrders.value = allPos;
      balances.value = allBals;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function recordWaste(input: {
    itemId: string;
    qty: number;
    unit: string;
    wasteReason: WasteReason;
    note?: string;
    actorId: string;
  }): Promise<void> {
    const curBranch = toValue(branchId);
    const wasteInput = createWasteMovement({
      ...input,
      branchId: curBranch,
    });
    const doc = createMovementDoc(wasteInput);
    await repo.recordMovement(doc);
    await refresh();
  }

  async function submitStocktake(
    counts: readonly PhysicalCountItem[],
    actorId: string,
  ): Promise<void> {
    const curBranch = toValue(branchId);
    const stocktakeId = `stk_${Date.now()}`;
    const adjustments = calculateStocktakeAdjustments(
      balances.value,
      counts,
      curBranch,
      actorId,
      stocktakeId,
    );

    for (const adj of adjustments) {
      await repo.recordMovement(createMovementDoc(adj));
    }

    await refresh();
  }

  async function receivePurchaseOrder(poId: string, actorId: string): Promise<void> {
    const curBranch = toValue(branchId);
    await repo.receivePurchaseOrder(curBranch, poId, actorId);
    await refresh();
  }

  async function saveItem(item: InventoryItemDoc): Promise<void> {
    await repo.saveItem(item);
    await refresh();
  }

  async function saveRecipe(recipe: InventoryRecipeDoc): Promise<void> {
    await repo.saveRecipe(recipe);
    await refresh();
  }

  async function saveSupplier(supplier: SupplierDoc): Promise<void> {
    await repo.saveSupplier(supplier);
    await refresh();
  }

  async function createPurchaseOrder(po: PurchaseOrderDoc): Promise<void> {
    await repo.createPurchaseOrder(po);
    await refresh();
  }

  return {
    items,
    recipes,
    movements,
    suppliers,
    purchaseOrders,
    balances,
    lowStockItems,
    lowStockCount,
    isLoading,
    error,
    refresh,
    recordWaste,
    submitStocktake,
    receivePurchaseOrder,
    saveItem,
    saveRecipe,
    saveSupplier,
    createPurchaseOrder,
  };
}
