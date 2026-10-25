# M6b — Inventory & Stock Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first, event-sourced inventory and recipe (BOM) management system with automatic stock deduction on bill settlement, support for modifiers and combos, waste logging, stocktaking, and a Vuetify0 admin modal.

**Architecture:** Raw ingredients (`InventoryItemDoc`) and recipes (`InventoryRecipeDoc`) are managed at global scope (`GLOBAL_BRANCH_ID`). Stock movements (`InventoryMovementDoc`) are append-only event logs scoped by `branchId` (`purchase`, `sale_deduction`, `waste`, `adjust`, `stocktake`), guaranteeing conflict-free multi-terminal sync. Current stock balances are materialized deterministically by summing `qtyDelta` across movements. When a bill transitions to `paid`, `resolveBillDeductions()` decomposes base products, variants, modifiers, and combo selections into required ingredient quantities and records idempotent `sale_deduction` movements.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, PouchDB via `DbAdapter`, UnoCSS (`presetWind4`), Vuetify0 (`@vuetify/v0`).

**Spec:** `docs/superpowers/specs/2026-10-25-m6b-inventory-design.md`

## Global Constraints

- **Mandatory `branchId`:** Every document envelope must contain `branchId`. Global definitions (ingredients, standard recipes, suppliers) use `GLOBAL_BRANCH_ID = '*'`. Operational movements (`inventory_movement`) and purchase orders must carry the active branch's ID.
- **Append-only movements & no mutable stock field:** Never store a mutable `stockQuantity` on the item document. All balances must be materialized by summing movement `qtyDelta` values.
- **Integer minor units for money:** Costs use `Money` minor units. Never store or calculate money as floating-point numbers.
- **Deterministic & Idempotent bill deduction:** Sale deductions for a given `billId` must be idempotent. Re-paying or re-projecting a bill must never produce duplicate deductions.
- **Headless UI:** Interactive UI built with `@vuetify/v0` primitives (`DataTable`, `Dialog`, `Select`, `Button`, `Input`) styled exclusively with design token shortcuts (`btn`, `panel-card`, `field-input`).
- **Pure domain logic in `src/core/`:** Domain files must not import Vue, PouchDB, or Tauri APIs.
- **i18n Parity:** Every key added to `src/i18n/vi.json` must have an exact counterpart in `src/i18n/en.json`.

## Review Focus

1. **Combo item recipe resolution:** When a combo is ordered with multiple chosen components, every selected product recipe is decomposed and deducted according to the ordered quantity. (Tested in Task 5)
2. **Modifier recipe deduction:** When a product line has multiple modifiers (e.g. "+ trân châu đen", "+ thạch pudding"), each modifier's recipe is multiplied by the line quantity and deducted. (Tested in Task 5)
3. **Idempotent settlement deduction:** Processing deductions for the same bill twice produces no duplicate movements. (Tested in Task 8)
4. **Stocktake reconciliation variance:** A stocktake count where physical count differs from expected stock emits an adjustment movement whose `qtyDelta` exactly reconciles the discrepancy. (Tested in Task 6)
5. **Low-stock threshold warning:** When cumulative movements reduce an item's current stock to or below `minThreshold`, `isLowStock` immediately flags true. (Tested in Task 4)

---

### Task 1: Document ID Helpers & Core Types

**Files:**
- Modify: `src/core/db/ids.ts`
- Create: `src/core/inventory/types.ts`
- Test: `src/core/inventory/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `DocEnvelope` from `src/core/db/envelope.ts`, `GLOBAL_BRANCH_ID` from `src/core/db/branch.ts`, `Money` from `src/core/money.ts`
- Produces:
  - `inventoryItemDocId(itemId: string): string` in `src/core/db/ids.ts`
  - `inventoryRecipeDocId(targetType: 'product' | 'variant' | 'modifier', targetId: string): string` in `src/core/db/ids.ts`
  - `inventoryMovementDocId(branchId: string, movementId: string): string` in `src/core/db/ids.ts`
  - `supplierDocId(supplierId: string): string` in `src/core/db/ids.ts`
  - `purchaseOrderDocId(branchId: string, poId: string): string` in `src/core/db/ids.ts`
  - Type definitions: `InventoryItemDoc`, `InventoryRecipeDoc`, `InventoryMovementDoc`, `SupplierDoc`, `PurchaseOrderDoc`, `MovementType`, `WasteReason` in `src/core/inventory/types.ts`

- [ ] **Step 1: Write failing tests for ID helpers and schemas**

```ts
// src/core/inventory/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  inventoryItemDocId,
  inventoryRecipeDocId,
  inventoryMovementDocId,
  supplierDocId,
  purchaseOrderDocId,
} from '../../db/ids';

describe('Inventory ID helpers', () => {
  it('formats inventoryItemDocId correctly', () => {
    expect(inventoryItemDocId('ing_coffee')).toBe('inventory_item:ing_coffee');
  });

  it('formats inventoryRecipeDocId correctly', () => {
    expect(inventoryRecipeDocId('product', 'prod_latte')).toBe('inventory_recipe:product:prod_latte');
    expect(inventoryRecipeDocId('modifier', 'opt_boba')).toBe('inventory_recipe:modifier:opt_boba');
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
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/types.test.ts`  
Expected: FAIL (functions not defined)

- [ ] **Step 3: Implement ID helpers in `src/core/db/ids.ts` and types in `src/core/inventory/types.ts`**

Implement `inventoryItemDocId`, `inventoryRecipeDocId`, `inventoryMovementDocId`, `supplierDocId`, and `purchaseOrderDocId` in `src/core/db/ids.ts`.  
Define full TypeScript interfaces in `src/core/inventory/types.ts` according to spec §4.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/types.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/ids.ts src/core/inventory/types.ts src/core/inventory/__tests__/types.test.ts
git commit -m "feat(inventory): add document ID helpers and core inventory types"
```

---

### Task 2: Inventory Items Factory & Validation

**Files:**
- Create: `src/core/inventory/item.ts`
- Test: `src/core/inventory/__tests__/item.test.ts`

**Interfaces:**
- Consumes: `InventoryItemDoc`, `CreateInventoryItemInput` from `src/core/inventory/types.ts`, `inventoryItemDocId` from `src/core/db/ids.ts`
- Produces: `createInventoryItemDoc(input: CreateInventoryItemInput): InventoryItemDoc`, `validateInventoryItem(doc: InventoryItemDoc): void`

- [ ] **Step 1: Write failing tests for item creation and validation**

```ts
// src/core/inventory/__tests__/item.test.ts
import { describe, it, expect } from 'vitest';
import { createInventoryItemDoc, validateInventoryItem } from '../item';
import { money } from '../../money';

describe('Inventory Item Factory & Validation', () => {
  it('creates a valid InventoryItemDoc with default values', () => {
    const doc = createInventoryItemDoc({
      itemId: 'ing_coffee_beans',
      sku: 'ING-CF-01',
      name: { vi: 'Hạt cà phê Robusta', en: 'Robusta Coffee Beans' },
      unit: 'g',
      costPerUnit: money(250, 'VND'),
      minThreshold: 1000,
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc._id).toBe('inventory_item:ing_coffee_beans');
    expect(doc.branchId).toBe('*');
    expect(doc.unit).toBe('g');
    expect(doc.costPerUnit.minor).toBe(250);
    expect(doc.minThreshold).toBe(1000);
    expect(doc.active).toBe(true);
  });

  it('rejects negative minThreshold or empty unit', () => {
    expect(() =>
      createInventoryItemDoc({
        itemId: 'ing_1',
        sku: 'SKU1',
        name: { vi: 'Muối', en: 'Salt' },
        unit: '',
        costPerUnit: money(10, 'VND'),
        minThreshold: 10,
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('unit must be a non-empty string');

    expect(() =>
      createInventoryItemDoc({
        itemId: 'ing_2',
        sku: 'SKU2',
        name: { vi: 'Đường', en: 'Sugar' },
        unit: 'g',
        costPerUnit: money(10, 'VND'),
        minThreshold: -5,
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('minThreshold must be non-negative');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/item.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement item factory and validator in `src/core/inventory/item.ts`**

Enforce required non-empty string for `unit`, non-negative `minThreshold`, and valid `Money`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/item.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/item.ts src/core/inventory/__tests__/item.test.ts
git commit -m "feat(inventory): add inventory item factory and validation"
```

---

### Task 3: Recipe / BOM Definition & Validation

**Files:**
- Create: `src/core/inventory/recipe.ts`
- Test: `src/core/inventory/__tests__/recipe.test.ts`

**Interfaces:**
- Consumes: `InventoryRecipeDoc`, `CreateRecipeInput`, `RecipeIngredient` from `src/core/inventory/types.ts`
- Produces: `createRecipeDoc(input: CreateRecipeInput): InventoryRecipeDoc`, `validateRecipe(doc: InventoryRecipeDoc): void`

- [ ] **Step 1: Write failing tests for recipe factory and validation**

```ts
// src/core/inventory/__tests__/recipe.test.ts
import { describe, it, expect } from 'vitest';
import { createRecipeDoc, validateRecipe } from '../recipe';

describe('Inventory Recipe / BOM', () => {
  it('creates a recipe for a product with multiple ingredients', () => {
    const doc = createRecipeDoc({
      recipeId: 'rec_latte',
      targetType: 'product',
      targetId: 'prod_latte',
      yieldQty: 1,
      ingredients: [
        { itemId: 'ing_coffee_beans', qty: 20, unit: 'g' },
        { itemId: 'ing_fresh_milk', qty: 150, unit: 'ml' },
      ],
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc._id).toBe('inventory_recipe:product:prod_latte');
    expect(doc.ingredients).toHaveLength(2);
    expect(doc.ingredients[0]?.qty).toBe(20);
  });

  it('creates a recipe for a modifier option', () => {
    const doc = createRecipeDoc({
      recipeId: 'rec_opt_boba',
      targetType: 'modifier',
      targetId: 'opt_boba',
      ingredients: [{ itemId: 'ing_boba', qty: 50, unit: 'g' }],
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc._id).toBe('inventory_recipe:modifier:opt_boba');
    expect(doc.targetType).toBe('modifier');
  });

  it('rejects recipes with empty ingredients or non-positive quantities', () => {
    expect(() =>
      createRecipeDoc({
        recipeId: 'rec_invalid',
        targetType: 'product',
        targetId: 'prod_1',
        ingredients: [],
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('Recipe must have at least one ingredient');

    expect(() =>
      createRecipeDoc({
        recipeId: 'rec_invalid2',
        targetType: 'product',
        targetId: 'prod_1',
        ingredients: [{ itemId: 'ing_1', qty: 0, unit: 'g' }],
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('Ingredient quantity must be positive');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/recipe.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement recipe factory and validator in `src/core/inventory/recipe.ts`**

Ensure `yieldQty >= 1`, `ingredients.length > 0`, and `qty > 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/recipe.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/recipe.ts src/core/inventory/__tests__/recipe.test.ts
git commit -m "feat(inventory): add recipe/BOM creation and validation"
```

---

### Task 4: Materialized Stock Engine & Movement Calculation

**Files:**
- Create: `src/core/inventory/movements.ts`
- Test: `src/core/inventory/__tests__/movements.test.ts`

**Interfaces:**
- Consumes: `InventoryItemDoc`, `InventoryMovementDoc`, `ItemStockBalance` from `src/core/inventory/types.ts`
- Produces:
  - `computeStockBalances(items: readonly InventoryItemDoc[], movements: readonly InventoryMovementDoc[]): Map<string, ItemStockBalance>`
  - `createMovementDoc(input: CreateMovementInput): InventoryMovementDoc`

- [ ] **Step 1: Write failing tests for materialized stock calculation**

```ts
// src/core/inventory/__tests__/movements.test.ts
import { describe, it, expect } from 'vitest';
import { computeStockBalances, createMovementDoc } from '../movements';
import { createInventoryItemDoc } from '../item';
import { money } from '../../money';

describe('Materialized Stock Calculation', () => {
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
        wasteReason: 'spill_breakage',
        actorId: 'user1',
        createdAt: '2026-10-25T10:00:00.000Z',
      }),
    ];

    const balances = computeStockBalances([coffee, milk], movements);

    const coffeeBalance = balances.get('ing_coffee');
    expect(coffeeBalance?.currentQty).toBe(400); // 1000 - 200 - 400
    expect(coffeeBalance?.isLowStock).toBe(true); // 400 <= 500

    const milkBalance = balances.get('ing_milk');
    expect(milkBalance?.currentQty).toBe(0);
    expect(milkBalance?.isLowStock).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/movements.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `computeStockBalances` and `createMovementDoc` in `src/core/inventory/movements.ts`**

Sum `qtyDelta` per `itemId` and evaluate `isLowStock = currentQty <= minThreshold`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/movements.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/movements.ts src/core/inventory/__tests__/movements.test.ts
git commit -m "feat(inventory): implement movement engine and materialized stock balances"
```

---

### Task 5: Bill Deduction Engine (Base Products, Variants, Modifiers, Combos)

**Files:**
- Create: `src/core/inventory/deduction.ts`
- Test: `src/core/inventory/__tests__/deduction.test.ts`

**Interfaces:**
- Consumes: `BillDoc`, `OrderLineItem` from `src/core/order/types.ts`, `InventoryRecipeDoc` from `src/core/inventory/types.ts`
- Produces: `resolveBillDeductions(bill: BillDoc, recipes: readonly InventoryRecipeDoc[], actorId: string): readonly CreateMovementInput[]`

- [ ] **Step 1: Write failing tests for resolving bill deductions with modifiers and combos**

```ts
// src/core/inventory/__tests__/deduction.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBillDeductions } from '../deduction';
import { createRecipeDoc } from '../recipe';
import type { BillDoc, OrderLineItem } from '../../order/types';
import { money } from '../../money';

describe('Bill Inventory Deduction Engine', () => {
  const coffeeRecipe = createRecipeDoc({
    recipeId: 'rec_coffee',
    targetType: 'product',
    targetId: 'prod_coffee',
    ingredients: [
      { itemId: 'ing_coffee_beans', qty: 25, unit: 'g' },
      { itemId: 'ing_condensed_milk', qty: 30, unit: 'ml' },
    ],
    now: '2026-10-25T00:00:00.000Z',
  });

  const bobaModifierRecipe = createRecipeDoc({
    recipeId: 'rec_mod_boba',
    targetType: 'modifier',
    targetId: 'opt_boba',
    ingredients: [{ itemId: 'ing_boba', qty: 40, unit: 'g' }],
    now: '2026-10-25T00:00:00.000Z',
  });

  const croissantRecipe = createRecipeDoc({
    recipeId: 'rec_croissant',
    targetType: 'product',
    targetId: 'prod_croissant',
    ingredients: [{ itemId: 'ing_frozen_croissant', qty: 1, unit: 'piece' }],
    now: '2026-10-25T00:00:00.000Z',
  });

  it('deducts ingredients for base products and selected modifiers', () => {
    const line: OrderLineItem = {
      lineId: 'l1',
      productId: 'prod_coffee',
      nameSnapshot: { vi: 'Cà phê sữa', en: 'Milk Coffee' },
      unitPriceSnapshot: money(35000, 'VND'),
      qty: 2,
      status: 'placed',
      addedAt: '2026-10-25T09:00:00.000Z',
      modifiers: [
        {
          groupId: 'grp_topping',
          groupNameSnapshot: 'Topping',
          optionId: 'opt_boba',
          optionNameSnapshot: 'Trân châu đen',
          priceDelta: money(10000, 'VND'),
        },
      ],
    };

    const mockBill = {
      _id: 'bill:dist1:b01',
      branchId: 'dist1',
      billId: 'b01',
      sessionId: 's01',
      billNumber: 'BILL-001',
      status: 'paid',
      lines: [line],
    } as unknown as BillDoc;

    const deductions = resolveBillDeductions(mockBill, [coffeeRecipe, bobaModifierRecipe], 'pos_terminal');

    // 2 cups of coffee: 25g * 2 = 50g coffee beans; 30ml * 2 = 60ml milk
    // 2 portions of boba: 40g * 2 = 80g boba
    const coffeeDeduction = deductions.find((d) => d.itemId === 'ing_coffee_beans');
    expect(coffeeDeduction?.qtyDelta).toBe(-50);
    expect(coffeeDeduction?.type).toBe('sale_deduction');
    expect(coffeeDeduction?.refId).toBe('b01');

    const milkDeduction = deductions.find((d) => d.itemId === 'ing_condensed_milk');
    expect(milkDeduction?.qtyDelta).toBe(-60);

    const bobaDeduction = deductions.find((d) => d.itemId === 'ing_boba');
    expect(bobaDeduction?.qtyDelta).toBe(-80);
  });

  it('deducts ingredients for combo selections', () => {
    const comboLine: OrderLineItem = {
      lineId: 'l2',
      productId: 'combo_breakfast',
      nameSnapshot: { vi: 'Combo Sáng', en: 'Breakfast Combo' },
      unitPriceSnapshot: money(50000, 'VND'),
      qty: 1,
      status: 'placed',
      addedAt: '2026-10-25T09:00:00.000Z',
      modifiers: [],
      comboSelections: [
        { groupKey: 'drink', optionIds: ['prod_coffee'] },
        { groupKey: 'food', optionIds: ['prod_croissant'] },
      ],
    };

    const mockBill = {
      _id: 'bill:dist1:b02',
      branchId: 'dist1',
      billId: 'b02',
      sessionId: 's02',
      billNumber: 'BILL-002',
      status: 'paid',
      lines: [comboLine],
    } as unknown as BillDoc;

    const deductions = resolveBillDeductions(mockBill, [coffeeRecipe, croissantRecipe], 'pos_terminal');

    const coffeeDeduction = deductions.find((d) => d.itemId === 'ing_coffee_beans');
    expect(coffeeDeduction?.qtyDelta).toBe(-25);

    const croissantDeduction = deductions.find((d) => d.itemId === 'ing_frozen_croissant');
    expect(croissantDeduction?.qtyDelta).toBe(-1);
  });

  it('ignores voided lines', () => {
    const voidedLine: OrderLineItem = {
      lineId: 'l3',
      productId: 'prod_coffee',
      nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
      unitPriceSnapshot: money(30000, 'VND'),
      qty: 5,
      status: 'voided',
      addedAt: '2026-10-25T09:00:00.000Z',
      modifiers: [],
    };

    const mockBill = {
      _id: 'bill:dist1:b03',
      branchId: 'dist1',
      billId: 'b03',
      sessionId: 's03',
      billNumber: 'BILL-003',
      status: 'paid',
      lines: [voidedLine],
    } as unknown as BillDoc;

    const deductions = resolveBillDeductions(mockBill, [coffeeRecipe], 'pos_terminal');
    expect(deductions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/deduction.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `resolveBillDeductions` in `src/core/inventory/deduction.ts`**

Inspect lines (ignoring `status === 'voided'`), resolve base product/variant recipe, modifier recipes, and combo option recipes, multiply by `line.qty`, group by `itemId`, and construct negative `sale_deduction` movements.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/deduction.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/deduction.ts src/core/inventory/__tests__/deduction.test.ts
git commit -m "feat(inventory): implement bill ingredient deduction for products, modifiers, and combos"
```

---

### Task 6: Stocktake & Waste Reconciliation

**Files:**
- Create: `src/core/inventory/stocktake.ts`
- Create: `src/core/inventory/waste.ts`
- Test: `src/core/inventory/__tests__/stocktake.test.ts`
- Test: `src/core/inventory/__tests__/waste.test.ts`

**Interfaces:**
- Consumes: `ItemStockBalance`, `InventoryMovementDoc`, `WasteReason` from `src/core/inventory/types.ts`
- Produces:
  - `calculateStocktakeAdjustments(expectedBalances: Map<string, ItemStockBalance>, counts: Array<{ itemId: string; countedQty: number; unit: string }>, branchId: string, actorId: string, stocktakeId: string): readonly CreateMovementInput[]`
  - `createWasteMovement(input: { branchId: string; itemId: string; qty: number; unit: string; wasteReason: WasteReason; note?: string; actorId: string; movementId?: string }): CreateMovementInput`

- [ ] **Step 1: Write failing tests for stocktake and waste**

```ts
// src/core/inventory/__tests__/stocktake.test.ts
import { describe, it, expect } from 'vitest';
import { calculateStocktakeAdjustments } from '../stocktake';
import type { ItemStockBalance } from '../types';

describe('Stocktake Reconciliation', () => {
  it('emits adjust movement for discrepancies', () => {
    const balances = new Map<string, ItemStockBalance>([
      ['ing_coffee', { itemId: 'ing_coffee', currentQty: 500, unit: 'g', minThreshold: 100, isLowStock: false }],
      ['ing_sugar', { itemId: 'ing_sugar', currentQty: 200, unit: 'g', minThreshold: 50, isLowStock: false }],
    ]);

    const physicalCounts = [
      { itemId: 'ing_coffee', countedQty: 480, unit: 'g' }, // loss of 20g
      { itemId: 'ing_sugar', countedQty: 200, unit: 'g' }, // exact match
    ];

    const adjustments = calculateStocktakeAdjustments(balances, physicalCounts, 'dist1', 'mgr_01', 'stk_01');

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.itemId).toBe('ing_coffee');
    expect(adjustments[0]?.qtyDelta).toBe(-20); // 480 - 500
    expect(adjustments[0]?.type).toBe('stocktake');
    expect(adjustments[0]?.refId).toBe('stk_01');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/stocktake.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement stocktake and waste calculation**

In `src/core/inventory/stocktake.ts`, compute `variance = countedQty - currentQty` and emit movements where `variance !== 0`. In `src/core/inventory/waste.ts`, construct negative `waste` movements.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/stocktake.test.ts src/core/inventory/__tests__/waste.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/stocktake.ts src/core/inventory/waste.ts src/core/inventory/__tests__/stocktake.test.ts src/core/inventory/__tests__/waste.test.ts
git commit -m "feat(inventory): add stocktake reconciliation and waste tracking logic"
```

---

### Task 7: Inventory Repository & Database Operations

**Files:**
- Create: `src/core/inventory/inventory-repository.ts`
- Test: `src/core/inventory/__tests__/inventory-repository.test.ts`

**Interfaces:**
- Consumes: `DbAdapter` from `src/core/db/adapter.ts`, types & factories from Tasks 1–6
- Produces: `createInventoryRepository(adapter: DbAdapter)` with:
  - `saveItem(item: InventoryItemDoc): Promise<void>`
  - `getItems(): Promise<InventoryItemDoc[]>`
  - `saveRecipe(recipe: InventoryRecipeDoc): Promise<void>`
  - `getRecipes(): Promise<InventoryRecipeDoc[]>`
  - `recordMovement(movement: InventoryMovementDoc): Promise<void>`
  - `recordMovements(movements: readonly InventoryMovementDoc[]): Promise<void>`
  - `getMovements(branchId: string): Promise<InventoryMovementDoc[]>`
  - `getStockBalances(branchId: string): Promise<Map<string, ItemStockBalance>>`
  - `saveSupplier(supplier: SupplierDoc): Promise<void>`
  - `getSuppliers(): Promise<SupplierDoc[]>`
  - `createPurchaseOrder(po: PurchaseOrderDoc): Promise<void>`
  - `receivePurchaseOrder(branchId: string, poId: string, actorId: string): Promise<void>`

- [ ] **Step 1: Write failing tests for repository persistence and stock calculation**

```ts
// src/core/inventory/__tests__/inventory-repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createInventoryRepository } from '../inventory-repository';
import { createInventoryItemDoc } from '../item';
import { createRecipeDoc } from '../recipe';
import { money } from '../../money';

describe('Inventory Repository', () => {
  let repo: ReturnType<typeof createInventoryRepository>;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    repo = createInventoryRepository(adapter);
  });

  it('saves items, recipes and retrieves them', async () => {
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
  });

  it('records purchase movement and materializes positive stock', async () => {
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

    const balances = await repo.getStockBalances('dist1');
    expect(balances.get('ing_tea')?.currentQty).toBe(500);
    expect(balances.get('ing_tea')?.isLowStock).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/inventory/__tests__/inventory-repository.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `createInventoryRepository` in `src/core/inventory/inventory-repository.ts`**

Implement CRUD operations, `receivePurchaseOrder` which automatically generates `purchase` movements for each PO item, and `getStockBalances(branchId)` querying items and branch movements.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/inventory/__tests__/inventory-repository.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory/inventory-repository.ts src/core/inventory/__tests__/inventory-repository.test.ts
git commit -m "feat(inventory): implement inventory repository with persistence and stock materialization"
```

---

### Task 8: Order Settlement Hook & End-to-End Deduction Integration

**Files:**
- Modify: `src/core/order/order-repository.ts`
- Create: `src/core/order/__tests__/inventory-settlement.test.ts`

**Interfaces:**
- Consumes: `createInventoryRepository` from `src/core/inventory/inventory-repository.ts`, `resolveBillDeductions` from `src/core/inventory/deduction.ts`
- Produces: Idempotent deduction invocation when a bill reaches status `'paid'` in `OrderRepository`.

- [ ] **Step 1: Write failing tests for automatic deduction when bill is settled**

```ts
// src/core/order/__tests__/inventory-settlement.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
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
      })
    );
    await inventoryRepo.saveRecipe(
      createRecipeDoc({
        recipeId: 'rec_cf',
        targetType: 'product',
        targetId: 'prod_cf',
        ingredients: [{ itemId: 'ing_beans', qty: 20, unit: 'g' }],
        now: '2026-10-25T00:00:00.000Z',
      })
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
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/order/__tests__/inventory-settlement.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update `src/core/order/order-repository.ts`**

When `finalState.bill.status === 'paid'` or `PAYMENT_ADDED` makes the bill paid, call `inventoryRepo.recordMovements(deductions)` using `resolveBillDeductions(finalState.bill, recipes)`. Ensure deduction is recorded with `refId: finalState.bill.billId` to prevent duplicate deduction.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/order/__tests__/inventory-settlement.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/order/order-repository.ts src/core/order/__tests__/inventory-settlement.test.ts
git commit -m "feat(order): hook inventory deduction into bill settlement"
```

---

### Task 9: UI State Composable (`useInventory.ts`) & i18n Localization

**Files:**
- Create: `src/features/inventory/useInventory.ts`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `src/features/inventory/__tests__/useInventory.test.ts`
- Test: `src/i18n/__tests__/i18n.test.ts`

**Interfaces:**
- Consumes: `createInventoryRepository` from `src/core/inventory/inventory-repository.ts`
- Produces: `useInventory(repo: InventoryRepository, branchId: Ref<string>)` returning reactive `items`, `balances`, `lowStockItems`, `refresh()`, `recordWaste()`, `submitStocktake()`.

- [ ] **Step 1: Add i18n keys and write failing tests for `useInventory` and i18n parity**

Add full Vietnamese and English keys under `inventory.*` (`inventory.title`, `inventory.tabs.stock`, `inventory.tabs.recipes`, `inventory.tabs.movements`, `inventory.tabs.waste`, `inventory.tabs.stocktake`, `inventory.tabs.suppliers`, `inventory.lowStockAlert`, `inventory.wasteReason.*`).

- [ ] **Step 2: Run i18n and useInventory tests**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts src/features/inventory/__tests__/useInventory.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `useInventory.ts` and ensure key parity in `vi.json` and `en.json`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts src/features/inventory/__tests__/useInventory.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/useInventory.ts src/features/inventory/__tests__/useInventory.test.ts src/i18n/vi.json src/i18n/en.json
git commit -m "feat(inventory): add useInventory composable and i18n localization keys"
```

---

### Task 10: Headless Vuetify0 Inventory Admin Modal (`InventoryAdminModal.vue`)

**Files:**
- Create: `src/features/inventory/InventoryAdminModal.vue`
- Modify: `src/App.vue`
- Test: `src/features/inventory/__tests__/InventoryAdminModal.test.ts`

**Interfaces:**
- Consumes: `useInventory` from `src/features/inventory/useInventory.ts`, Vuetify0 primitives (`Dialog`, `DataTable`, `Button`, `Select`, `Input`)
- Produces: `InventoryAdminModal.vue` with tabbed management and low-stock visual badges.

- [ ] **Step 1: Write component tests for `InventoryAdminModal.vue`**

Test tab navigation, low-stock badge rendering, waste submission, and stocktake count entry.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/features/inventory/__tests__/InventoryAdminModal.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `InventoryAdminModal.vue` and mount in `src/App.vue` header**

Build modal with UnoCSS token classes (`panel-card`, `btn-primary`, `field-input`). Add an "Inventory / Kho" button to `src/App.vue` header with a low-stock counter badge.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/inventory/__tests__/InventoryAdminModal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/InventoryAdminModal.vue src/features/inventory/__tests__/InventoryAdminModal.test.ts src/App.vue
git commit -m "feat(ui): add InventoryAdminModal with tabbed management and low-stock alerts"
```

---

### Task 11: End-to-End Acceptance Test & Final Verification

**Files:**
- Create: `tests/m6b-inventory-acceptance.test.ts`

**Interfaces:**
- Exercises the complete inventory workflow across real `DbAdapter` instances.

- [ ] **Step 1: Write the acceptance test suite**

Verify:
1. Creating ingredient items (Coffee, Milk, Boba, Bread).
2. Linking recipes for products, modifiers, and combos.
3. Inbound purchase order arrival updating balances.
4. Placing an order with modifiers and combo items -> bill payment -> automated deduction verification.
5. Logging waste for an expired ingredient -> stock reflects reduction.
6. Stocktake count -> automatic variance adjustment movement.

- [ ] **Step 2: Run full verification suite**

Run:
```bash
npm run test
npx vue-tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

- [ ] **Step 3: Commit**

```bash
git add tests/m6b-inventory-acceptance.test.ts
git commit -m "test(inventory): add M6b end-to-end acceptance test suite"
```
