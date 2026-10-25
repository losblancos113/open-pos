import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createInventoryRepository } from '@/core/inventory/inventory-repository';
import { createOrderRepository } from '@/core/order/order-repository';
import { createInventoryItemDoc } from '@/core/inventory/item';
import { createRecipeDoc } from '@/core/inventory/recipe';
import { createWasteMovement } from '@/core/inventory/waste';
import { calculateStocktakeAdjustments } from '@/core/inventory/stocktake';
import { createMovementDoc } from '@/core/inventory/movements';
import { money } from '@/core/money';
import { purchaseOrderDocId, supplierDocId } from '@/core/db/ids';
import type { PurchaseOrderDoc, SupplierDoc } from '@/core/inventory/types';

describe('Milestone 6b — Inventory & Stock Control End-to-End Acceptance Test', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let inventoryRepo: ReturnType<typeof createInventoryRepository>;
  let orderRepo: ReturnType<typeof createOrderRepository>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    inventoryRepo = createInventoryRepository(adapter);
    orderRepo = createOrderRepository({ adapter, inventoryRepo });
  });

  it('runs complete lifecycle: recipe setup, PO receiving, automated deduction on POS sale, waste, and stocktake', async () => {
    const BRANCH_HQ = 'hq';
    const BRANCH_DIST1 = 'dist1';

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Setup Ingredients Catalog (Global definitions)
    // ──────────────────────────────────────────────────────────────────────────
    const coffeeBeans = createInventoryItemDoc({
      itemId: 'ing_coffee_beans',
      sku: 'ING-CF-01',
      name: { vi: 'Hạt cà phê Robusta', en: 'Robusta Coffee Beans' },
      unit: 'g',
      costPerUnit: money(250, 'VND'),
      minThreshold: 500,
    });
    const condensedMilk = createInventoryItemDoc({
      itemId: 'ing_condensed_milk',
      sku: 'ING-MK-01',
      name: { vi: 'Sữa đặc Ông Thọ', en: 'Condensed Milk' },
      unit: 'ml',
      costPerUnit: money(120, 'VND'),
      minThreshold: 300,
    });
    const bobaPearls = createInventoryItemDoc({
      itemId: 'ing_boba_pearls',
      sku: 'ING-BB-01',
      name: { vi: 'Trân châu đen', en: 'Black Boba Pearls' },
      unit: 'g',
      costPerUnit: money(80, 'VND'),
      minThreshold: 200,
    });
    const croissant = createInventoryItemDoc({
      itemId: 'ing_croissant',
      sku: 'ING-CR-01',
      name: { vi: 'Bánh sừng bò đông lạnh', en: 'Frozen Croissant' },
      unit: 'piece',
      costPerUnit: money(15000, 'VND'),
      minThreshold: 10,
    });

    await inventoryRepo.saveItem(coffeeBeans);
    await inventoryRepo.saveItem(condensedMilk);
    await inventoryRepo.saveItem(bobaPearls);
    await inventoryRepo.saveItem(croissant);

    const savedItems = await inventoryRepo.getItems();
    expect(savedItems).toHaveLength(4);

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Setup Recipes (BOM): Base product, variant, modifier, and combo item
    // ──────────────────────────────────────────────────────────────────────────
    // Base Coffee (Size M): 25g coffee, 30ml condensed milk
    const coffeeRecipe = createRecipeDoc({
      recipeId: 'rec_coffee_m',
      targetType: 'product',
      targetId: 'prod_coffee',
      ingredients: [
        { itemId: 'ing_coffee_beans', qty: 25, unit: 'g' },
        { itemId: 'ing_condensed_milk', qty: 30, unit: 'ml' },
      ],
    });

    // Variant Coffee (Size L): 35g coffee, 45ml condensed milk
    const coffeeLargeRecipe = createRecipeDoc({
      recipeId: 'rec_coffee_l',
      targetType: 'variant',
      targetId: 'var_coffee_large',
      ingredients: [
        { itemId: 'ing_coffee_beans', qty: 35, unit: 'g' },
        { itemId: 'ing_condensed_milk', qty: 45, unit: 'ml' },
      ],
    });

    // Modifier option: + Trân châu đen (40g boba)
    const bobaModifierRecipe = createRecipeDoc({
      recipeId: 'rec_opt_boba',
      targetType: 'modifier',
      targetId: 'opt_boba',
      ingredients: [{ itemId: 'ing_boba_pearls', qty: 40, unit: 'g' }],
    });

    // Croissant food recipe: 1 frozen croissant
    const croissantRecipe = createRecipeDoc({
      recipeId: 'rec_croissant',
      targetType: 'product',
      targetId: 'prod_croissant',
      ingredients: [{ itemId: 'ing_croissant', qty: 1, unit: 'piece' }],
    });

    await inventoryRepo.saveRecipe(coffeeRecipe);
    await inventoryRepo.saveRecipe(coffeeLargeRecipe);
    await inventoryRepo.saveRecipe(bobaModifierRecipe);
    await inventoryRepo.saveRecipe(croissantRecipe);

    const savedRecipes = await inventoryRepo.getRecipes();
    expect(savedRecipes).toHaveLength(4);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Purchase Order Inbound Delivery for Branch HQ
    // ──────────────────────────────────────────────────────────────────────────
    const supplier: SupplierDoc = {
      _id: supplierDocId('sup_vinamilk'),
      branchId: '*',
      docType: 'supplier',
      schemaVersion: 1,
      supplierId: 'sup_vinamilk',
      name: 'Vinamilk Distribution',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await inventoryRepo.saveSupplier(supplier);

    const poDoc: PurchaseOrderDoc = {
      _id: purchaseOrderDocId(BRANCH_HQ, 'po_hq_001'),
      branchId: BRANCH_HQ,
      docType: 'purchase_order',
      schemaVersion: 1,
      poId: 'po_hq_001',
      poNumber: 'PO-HQ-001',
      supplierId: 'sup_vinamilk',
      supplierName: 'Vinamilk Distribution',
      items: [
        { itemId: 'ing_coffee_beans', qty: 2000, unit: 'g', unitCost: money(250, 'VND'), totalCost: money(500000, 'VND') },
        { itemId: 'ing_condensed_milk', qty: 2000, unit: 'ml', unitCost: money(120, 'VND'), totalCost: money(240000, 'VND') },
        { itemId: 'ing_boba_pearls', qty: 1000, unit: 'g', unitCost: money(80, 'VND'), totalCost: money(80000, 'VND') },
        { itemId: 'ing_croissant', qty: 50, unit: 'piece', unitCost: money(15000, 'VND'), totalCost: money(750000, 'VND') },
      ],
      totalAmount: money(1570000, 'VND'),
      status: 'draft',
      actorId: 'manager_hq',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await inventoryRepo.createPurchaseOrder(poDoc);

    // Initial stock before receive: 0
    let hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_coffee_beans')?.currentQty).toBe(0);

    // Receive PO -> generates purchase movements
    await inventoryRepo.receivePurchaseOrder(BRANCH_HQ, 'po_hq_001', 'manager_hq');

    hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_coffee_beans')?.currentQty).toBe(2000);
    expect(hqBalances.get('ing_condensed_milk')?.currentQty).toBe(2000);
    expect(hqBalances.get('ing_boba_pearls')?.currentQty).toBe(1000);
    expect(hqBalances.get('ing_croissant')?.currentQty).toBe(50);
    expect(hqBalances.get('ing_coffee_beans')?.isLowStock).toBe(false);

    // Verify branch isolation: Branch DIST1 still has 0 stock
    const dist1Balances = await inventoryRepo.getStockBalances(BRANCH_DIST1);
    expect(dist1Balances.get('ing_coffee_beans')?.currentQty).toBe(0);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. POS Sale with Variant, Modifiers, and Combo -> Settlement Deduction
    // ──────────────────────────────────────────────────────────────────────────
    // Order:
    // - 2 Cà phê size L (variant) with + Trân châu đen (modifier)
    //   -> Coffee: 35g * 2 = 70g
    //   -> Milk: 45ml * 2 = 90ml
    //   -> Boba: 40g * 2 = 80g
    // - 1 Combo Bữa Sáng (1 standard Coffee + 1 Croissant)
    //   -> Coffee: 25g * 1 = 25g
    //   -> Milk: 30ml * 1 = 30ml
    //   -> Croissant: 1 * 1 = 1 piece
    // Total deductions:
    //   -> Coffee beans: 70g + 25g = 95g
    //   -> Condensed milk: 90ml + 30ml = 120ml
    //   -> Boba pearls: 80g
    //   -> Croissant: 1 piece
    await orderRepo.appendEvents(BRANCH_HQ, 'session_table1', [
      {
        eventId: 'ev_open',
        type: 'SESSION_OPENED',
        sessionId: 'session_table1',
        billId: 'bill_001',
        actorId: 'cashier_01',
        deviceId: 'term_01',
        payload: { tableIds: ['table_1'], openedAt: '2026-10-25T10:00:00.000Z' },
        createdAt: '2026-10-25T10:00:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_line_1',
        type: 'LINE_ADDED',
        sessionId: 'session_table1',
        billId: 'bill_001',
        actorId: 'cashier_01',
        deviceId: 'term_01',
        payload: {
          lineId: 'line_1',
          productId: 'prod_coffee',
          variantId: 'var_coffee_large',
          nameSnapshot: { vi: 'Cà phê size L', en: 'Coffee Large' },
          unitPriceSnapshot: money(45000, 'VND'),
          qty: 2,
          modifiers: [
            {
              groupId: 'grp_toppings',
              groupNameSnapshot: 'Topping',
              optionId: 'opt_boba',
              optionNameSnapshot: 'Trân châu đen',
              priceDelta: money(10000, 'VND'),
            },
          ],
        },
        createdAt: '2026-10-25T10:01:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_line_2',
        type: 'LINE_ADDED',
        sessionId: 'session_table1',
        billId: 'bill_001',
        actorId: 'cashier_01',
        deviceId: 'term_01',
        payload: {
          lineId: 'line_2',
          productId: 'combo_breakfast',
          nameSnapshot: { vi: 'Combo Sáng', en: 'Breakfast Combo' },
          unitPriceSnapshot: money(60000, 'VND'),
          qty: 1,
          comboSelections: [
            { groupKey: 'drink', optionIds: ['prod_coffee'] },
            { groupKey: 'food', optionIds: ['prod_croissant'] },
          ],
        },
        createdAt: '2026-10-25T10:02:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_pay',
        type: 'PAYMENT_ADDED',
        sessionId: 'session_table1',
        billId: 'bill_001',
        actorId: 'cashier_01',
        deviceId: 'term_01',
        payload: {
          paymentId: 'pay_001',
          method: 'cash',
          amount: money(170000, 'VND'),
          tendered: money(200000, 'VND'),
          change: money(30000, 'VND'),
          createdAt: '2026-10-25T10:05:00.000Z',
        },
        createdAt: '2026-10-25T10:05:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // Verify stock decremented automatically upon payment
    hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_coffee_beans')?.currentQty).toBe(2000 - 95); // 1905g
    expect(hqBalances.get('ing_condensed_milk')?.currentQty).toBe(2000 - 120); // 1880ml
    expect(hqBalances.get('ing_boba_pearls')?.currentQty).toBe(1000 - 80); // 920g
    expect(hqBalances.get('ing_croissant')?.currentQty).toBe(50 - 1); // 49 pieces

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Idempotent Settlement: Replay / BILL_CLOSED must not re-deduct
    // ──────────────────────────────────────────────────────────────────────────
    await orderRepo.appendEvents(BRANCH_HQ, 'session_table1', [
      {
        eventId: 'ev_close',
        type: 'BILL_CLOSED',
        sessionId: 'session_table1',
        billId: 'bill_001',
        actorId: 'cashier_01',
        deviceId: 'term_01',
        payload: { closedAt: '2026-10-25T10:06:00.000Z' },
        createdAt: '2026-10-25T10:06:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // Balances must remain strictly the same
    hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_coffee_beans')?.currentQty).toBe(1905);
    expect(hqBalances.get('ing_croissant')?.currentQty).toBe(49);

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Waste Tracking (Logging Spoilage / Damage)
    // ──────────────────────────────────────────────────────────────────────────
    // Staff dropped 2 croissants on the floor
    const wasteMov = createWasteMovement({
      branchId: BRANCH_HQ,
      itemId: 'ing_croissant',
      qty: 2,
      unit: 'piece',
      wasteReason: 'damaged',
      note: 'Rơi xuống sàn bếp',
      actorId: 'baker_01',
    });
    await inventoryRepo.recordMovement(createMovementDoc(wasteMov));

    hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_croissant')?.currentQty).toBe(47); // 49 - 2 = 47

    // ──────────────────────────────────────────────────────────────────────────
    // 7. Stocktake Reconciliation (Physical Count Audit)
    // ──────────────────────────────────────────────────────────────────────────
    // Manager counts 1890g of coffee beans (loss of 15g) and 47 croissants (exact match)
    const physicalCounts = [
      { itemId: 'ing_coffee_beans', countedQty: 1890, unit: 'g' },
      { itemId: 'ing_croissant', countedQty: 47, unit: 'piece' },
    ];
    const adjustments = calculateStocktakeAdjustments(
      hqBalances,
      physicalCounts,
      BRANCH_HQ,
      'manager_hq',
      'stk_audit_01',
    );

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.itemId).toBe('ing_coffee_beans');
    expect(adjustments[0]?.qtyDelta).toBe(-15); // 1890 - 1905 = -15

    for (const adj of adjustments) {
      await inventoryRepo.recordMovement(createMovementDoc(adj));
    }

    // Materialized stock now exactly matches physical count: 1890g
    hqBalances = await inventoryRepo.getStockBalances(BRANCH_HQ);
    expect(hqBalances.get('ing_coffee_beans')?.currentQty).toBe(1890);
  });
});
