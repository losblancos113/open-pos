# M6b — Inventory & Stock Control Design Document

**Date:** 2026-10-25  
**Status:** Approved by User  
**Module:** `src/core/inventory/`, `src/core/db/ids.ts`, `src/features/inventory/`, `src/i18n/`  
**Authority:** Follows `docs/superpowers/specs/2026-10-20-open-pos-design.md` (§4.5, §7.1, §9, §13.3)

---

## 1. Intent & The Why

In Vietnamese F&B (cafés, milk tea shops, restaurants), food cost and ingredient shrinkage account for 25%–38% of total revenue. Operators face three major pain points:
1. **Blind Stock & Theft:** Without recipe-level BOM (Bill of Materials), staff can sell drinks without ringing them up or pour excess portions without detection.
2. **Offline-First Multi-Terminal Stock Conflicts:** Traditional POS databases attempt to update a single mutable `stock_quantity` counter. When 3 offline terminals make sales simultaneously, PouchDB/CouchDB experiences revision conflicts (`409 Conflict`), resulting in discarded or corrupted inventory levels.
3. **Complex Modifier & Combo Deductions:** In modern cafés, 40%+ of sales include modifications (e.g. "+ trân châu đen", "+ 1 shot espresso", "50% đường") or combo sets. Tracking only base products causes ingredient stock to drift rapidly.

Milestone 6b delivers an event-sourced, append-only inventory engine:
- Ingredients are defined with units, minimum alert thresholds, and unit costs.
- Recipes (BOM) map base products, variants, modifier options, and combo selections to ingredient quantities.
- Stock balances are materialized deterministically from append-only `inventory_movements` (`purchase`, `sale_deduction`, `waste`, `adjust`, `stocktake`), completely eliminating multi-device sync conflicts.
- Sale deductions execute automatically upon bill settlement (`paid`).
- Cashiers and managers gain clear operator workflows for stocktaking, waste tracking, and supplier receipts.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **G1 (Ingredient Catalog):** CRUD for `inventory_items` (`inventory_item:<itemId>`) with name, SKU, barcode, unit of measure (`g`, `ml`, `piece`, `can`, `kg`, `pack`), cost per unit (`Money`), and low-stock warning threshold.
- **G2 (Recipe / BOM Engine):** CRUD for `inventory_recipes` (`inventory_recipe:<targetType>:<targetId>`), mapping products, product variants, and modifier options to ingredient consumption lists.
- **G3 (Combo Deduction Support):** Full decomposition of `OrderLineItem` including `variantId`, `modifiers`, and `comboSelections` into exact ingredient requirements.
- **G4 (Append-Only Movements & Materialized Balances):** Store `inventory_movements` as immutable records. Compute branch stock balances deterministically via `calculateStockBalances(movements, items)` without race conditions or sync conflicts.
- **G5 (Automatic Settlement Deduction):** Hook into `OrderRepository` to trigger idempotent `sale_deduction` movements when a bill transitions to `paid`.
- **G6 (Waste & Loss Tracking):** Operator workflow to record spoilage, breakage, expiration, or staff consumption with structured reasons.
- **G7 (Stocktaking / Reconciliation):** Stock audit session comparing physical counts against materialized expectations, automatically emitting `stocktake` delta movements.
- **G8 (Suppliers & Inbound Purchase):** Lightweight supplier management and receipt creation emitting `purchase` movements.
- **G9 (UI / UX):** Comprehensive Vuetify0 headless management UI (`InventoryAdminModal.vue`) with tabbed views, stock cards, low-stock indicators, and UnoCSS styling.
- **G10 (i18n Parity):** 100% key parity across `vi.json` and `en.json`.

### Non-Goals
- **Automated Reordering / EDI:** Automatic purchase orders sent to external supplier APIs over EDI/email are deferred to enterprise modules.
- **FIFO / LIFO Batch Tracking:** In v1, stock uses weighted-average or latest unit cost; individual per-batch lot expiration tracking is reserved for central commissary modules.
- **Inter-branch Stock Transfer Dispatch/Transit:** Inter-branch movements are recorded as direct adjustments/purchases in v1 rather than multi-stage shipping/in-transit workflows.

### Anti-Goals
- **Mutable `stock_quantity` fields on item docs:** Never mutate an item's stock counter directly in PouchDB. All balances MUST be computed from append-only movements.
- **Floating-point ingredient math:** Measurements must use integer or fixed-precision arithmetic (e.g. grams, milligrams, milliliters, tenths of a milliliter) to avoid floating-point drift.
- **Blocking offline sales when out of stock:** POS sales must never fail or block a cashier because an ingredient balance is zero or negative (negative stock indicates unrecorded deliveries or mis-measured recipes, which is resolved via stocktake).

---

## 3. Constraints & Invariants

1. **Mandatory `branchId` (M0 Invariant 4.1):** All movements and branch-specific documents must carry valid `branchId`. Global ingredient definitions and standard recipes use `GLOBAL_BRANCH_ID = '*'`.
2. **Integer Minor Units (M0 Invariant 4.2):** Cost values use `Money` minor units.
3. **Deterministic Materialization (M0 Invariant 4.3):** Stock balance for any item at branch $B$ at time $T$ is the deterministic sum of all `qtyDelta` from movements at branch $B$ up to time $T$.
4. **Idempotent Settlement Deduction:** Deducting stock for `billId` must be idempotent. Re-evaluating or re-playing bill settlement must not create duplicate deductions.
5. **Headless UI with Vuetify0 & UnoCSS (M0 Invariant 4.8 & 4.9):** All form controls, data tables, dialogs, and buttons use `@vuetify/v0` primitives styled with token shortcuts (`panel-card`, `btn`, `field-input`).
6. **Pure Domain Logic in `src/core/` (M0 Rule):** Domain logic must not import Vue, PouchDB, or Tauri APIs.

---

## 4. Data Models & Document Schemas

### 4.1 Document ID Helpers (`src/core/db/ids.ts`)

```ts
inventoryItemDocId(itemId: string): string
// -> "inventory_item:<itemId>"

inventoryRecipeDocId(targetType: 'product' | 'variant' | 'modifier', targetId: string): string
// -> "inventory_recipe:<targetType>:<targetId>"

inventoryMovementDocId(branchId: string, movementId: string): string
// -> "inventory_movement:<branchId>:<movementId>"

supplierDocId(supplierId: string): string
// -> "supplier:<supplierId>"

purchaseOrderDocId(branchId: string, poId: string): string
// -> "purchase_order:<branchId>:<poId>"
```

### 4.2 Inventory Item (`InventoryItemDoc`)

```ts
export interface InventoryItemDoc {
  _id: string; // inventory_item:<itemId>
  branchId: string; // GLOBAL_BRANCH_ID ('*') or specific branch
  docType: 'inventory_item';
  schemaVersion: 1;
  itemId: string;
  sku: string;
  barcode?: string;
  name: LocalizedText;
  unit: string; // 'g' | 'ml' | 'piece' | 'can' | 'kg' | 'pack' | string
  costPerUnit: Money;
  minThreshold: number; // minimum stock level before warning
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _rev?: string;
}
```

### 4.3 Inventory Recipe / BOM (`InventoryRecipeDoc`)

```ts
export type RecipeTargetType = 'product' | 'variant' | 'modifier';

export interface RecipeIngredient {
  itemId: string;
  qty: number; // quantity in item's base unit (e.g. 25 for 25g)
  unit: string;
}

export interface InventoryRecipeDoc {
  _id: string; // inventory_recipe:<targetType>:<targetId>
  branchId: string; // GLOBAL_BRANCH_ID ('*')
  docType: 'inventory_recipe';
  schemaVersion: 1;
  recipeId: string;
  targetType: RecipeTargetType;
  targetId: string; // productId, variantId, or modifierOptionId
  yieldQty: number; // default 1
  ingredients: readonly RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
  _rev?: string;
}
```

### 4.4 Inventory Movement (`InventoryMovementDoc`)

```ts
export type MovementType =
  | 'purchase'        // Nhập hàng từ nhà cung cấp
  | 'sale_deduction' // Trừ kho tự động khi thanh toán bill
  | 'waste'          // Xuất hủy / hao hụt / hư hỏng
  | 'adjust'         // Điều chỉnh thủ công
  | 'stocktake';      // Điều chỉnh sau kiểm kê thực tế

export type WasteReason =
  | 'expired'         // Hết hạn sử dụng
  | 'damaged'         // Đổ vỡ / dập nát / hư hỏng
  | 'burnt_mistake'   // Pha chế hỏng / làm sai món
  | 'quality_reject'  // Chất lượng nguyên liệu không đạt
  | 'staff_meal'      // Tiêu dùng nội bộ / cơm nhân viên
  | 'other';

export interface InventoryMovementDoc {
  _id: string; // inventory_movement:<branchId>:<movementId>
  branchId: string;
  docType: 'inventory_movement';
  schemaVersion: 1;
  movementId: string;
  type: MovementType;
  itemId: string;
  qtyDelta: number; // positive for inbound/adjustment increase, negative for deduction/waste
  unit: string;
  unitCost?: Money;
  totalCost?: Money;
  refId?: string; // billId, poId, stocktakeId
  wasteReason?: WasteReason;
  note?: string;
  actorId: string;
  createdAt: string;
  _rev?: string;
}
```

### 4.5 Supplier & Purchase Order (`SupplierDoc`, `PurchaseOrderDoc`)

```ts
export interface SupplierDoc {
  _id: string; // supplier:<supplierId>
  branchId: string; // GLOBAL_BRANCH_ID ('*')
  docType: 'supplier';
  schemaVersion: 1;
  supplierId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _rev?: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  qty: number;
  unit: string;
  unitCost: Money;
  totalCost: Money;
}

export interface PurchaseOrderDoc {
  _id: string; // purchase_order:<branchId>:<poId>
  branchId: string;
  docType: 'purchase_order';
  schemaVersion: 1;
  poId: string;
  poNumber: string; // e.g. "PO-HQ-20261025-001"
  supplierId: string;
  supplierName: string;
  items: readonly PurchaseOrderItem[];
  totalAmount: Money;
  status: 'draft' | 'received';
  receivedAt?: string;
  actorId: string;
  createdAt: string;
  updatedAt: string;
  _rev?: string;
}
```

---

## 5. Core Algorithms & Architecture

### 5.1 Materialized Stock Calculation

Current stock level for item $i$ at branch $B$ is calculated purely from movements:

$$\text{Stock}(i, B) = \sum_{m \in \text{Movements}(B, i)} m.\text{qtyDelta}$$

```ts
export interface ItemStockBalance {
  itemId: string;
  currentQty: number;
  unit: string;
  minThreshold: number;
  isLowStock: boolean;
  lastMovementAt?: string;
}

export function computeStockBalances(
  items: readonly InventoryItemDoc[],
  movements: readonly InventoryMovementDoc[],
): Map<string, ItemStockBalance> {
  const map = new Map<string, ItemStockBalance>();

  for (const item of items) {
    map.set(item.itemId, {
      itemId: item.itemId,
      currentQty: 0,
      unit: item.unit,
      minThreshold: item.minThreshold,
      isLowStock: false,
    });
  }

  for (const m of movements) {
    const bal = map.get(m.itemId);
    if (bal) {
      bal.currentQty += m.qtyDelta;
      if (!bal.lastMovementAt || m.createdAt > bal.lastMovementAt) {
        bal.lastMovementAt = m.createdAt;
      }
    }
  }

  for (const bal of map.values()) {
    bal.isLowStock = bal.currentQty <= bal.minThreshold;
  }

  return map;
}
```

### 5.2 Bill Deduction Resolution (Base Products, Variants, Modifiers, Combos)

When a bill is paid, `resolveBillDeductions(bill, recipes)` breaks down the lines:

1. **Base Product / Variant:**
   - Look for recipe target `variant:${line.variantId}` if `line.variantId` exists.
   - If not found or no variant, look for recipe target `product:${line.productId}`.
   - Multiply each ingredient `qty` by `line.qty`.

2. **Modifiers:**
   - For each modifier in `line.modifiers`:
   - Look for recipe target `modifier:${mod.optionId}` (or `${mod.groupId}:${mod.optionId}`).
   - Multiply ingredient `qty` by `line.qty`.

3. **Combos:**
   - If `line.comboSelections` has selections:
   - For each `optionId` in `selection.optionIds`:
   - Resolve product recipe for that `optionId` and multiply by `line.qty`.

4. **Aggregate:**
   - Group by `itemId`, summing required quantities.
   - Emit negative `qtyDelta = -totalQty` with `type: 'sale_deduction'`, `refId: bill.billId`.

### 5.3 Stocktake Reconciliation

1. Manager opens stocktake session. System loads current materialized balances.
2. Manager/staff counts actual on-hand quantity for each item.
3. System computes:
   $$\text{varianceQty} = \text{countedQty} - \text{expectedQty}$$
4. If $\text{varianceQty} \neq 0$: emit movement with `type: 'stocktake'`, `qtyDelta: varianceQty`, `refId: stocktakeId`.
5. Materialized stock immediately equals $\text{countedQty}$.

---

## 6. Security & Branch Isolation

1. **Branch Scoping:** Movements are strictly scoped by `branchId`. A cashier at Branch 1 can only see and emit movements for `dist1`.
2. **Replication Filter:** Follows M6a sidecar filter rules: movements with `branchId === 'dist1'` replicate only to Branch 1 terminals. HQ receives all movements.
3. **Auditability:** Every movement records `actorId`, `createdAt`, `type`, and `refId`. Movements are immutable; corrections must be made via compensating `adjust` or `stocktake` movements.

---

## 7. User Interface & Vuetify0 Specification

The inventory suite is contained in a clean modal / view with 5 main tabs:

1. **Tồn kho & Cảnh báo (Stock & Low Stock Alerts):**
   - KPI cards: Total Items, Low-Stock Alert Count, Total Stock Value.
   - Vuetify0 `DataTable` showing SKU, item name, unit, current stock, min threshold, alert badge, and quick action buttons.
   - Filter by: All / Low Stock / Search keyword.
2. **Công thức định lượng (Recipes / BOM):**
   - Searchable product / modifier list.
   - Recipe editor: add ingredients with target quantities and units.
3. **Thẻ kho & Lịch sử (Movements History):**
   - Timeline/table of movements with filter by date, movement type, and item.
4. **Xuất hủy / Hao hụt (Waste Tracking):**
   - Quick form: select item, enter quantity, pick reason (`expired`, `damaged`, `burnt_mistake`, etc.), optional note, submit.
5. **Kiểm kê kho (Stocktake):**
   - Count sheet: displays expected stock, allows entering physical count, highlights variance, and 1-click submit to reconcile.
6. **Nhà cung cấp & Nhập hàng (Suppliers & Receipts):**
   - List suppliers, create purchase receipt, immediately updates stock.

---

## 8. Testing Strategy

1. **Unit Tests (TDD):**
   - `inventory-item.test.ts`: validation, UOM rules, positive cost & minThreshold.
   - `recipe.test.ts`: ingredient mapping, variant override, modifier recipe resolution, combo decomposition.
   - `movements.test.ts`: calculation of materialized stock, chronological ordering, idempotency.
   - `deduction.test.ts`: full bill deduction for base + variant + modifier + combo items.
   - `stocktake.test.ts`: variance calculation and adjustment movement emission.
2. **Repository & Integration Tests:**
   - `inventory-repository.test.ts`: `DbAdapter` persistence, branch filtering, receipt creation, bill deduction hook.
3. **End-to-End Order Settlement Integration Test:**
   - Placing bill with coffee + pearl topping -> paying bill -> verifying exact inventory movements emitted and stock decremented.
4. **UI Tests:**
   - `InventoryAdminModal.test.ts`: tab switching, low-stock badge rendering, waste entry submission, stocktake variance calculation.
5. **i18n Parity Test:**
   - Verification of 100% parity across `vi.json` and `en.json`.
