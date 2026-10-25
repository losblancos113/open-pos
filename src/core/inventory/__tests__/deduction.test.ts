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

  const largeCoffeeRecipe = createRecipeDoc({
    recipeId: 'rec_coffee_large',
    targetType: 'variant',
    targetId: 'var_coffee_l',
    ingredients: [
      { itemId: 'ing_coffee_beans', qty: 35, unit: 'g' },
      { itemId: 'ing_condensed_milk', qty: 45, unit: 'ml' },
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

  const puddingModifierRecipe = createRecipeDoc({
    recipeId: 'rec_mod_pudding',
    targetType: 'modifier',
    targetId: 'opt_pudding',
    ingredients: [{ itemId: 'ing_pudding', qty: 50, unit: 'g' }],
    now: '2026-10-25T00:00:00.000Z',
  });

  const croissantRecipe = createRecipeDoc({
    recipeId: 'rec_croissant',
    targetType: 'product',
    targetId: 'prod_croissant',
    ingredients: [{ itemId: 'ing_frozen_croissant', qty: 1, unit: 'piece' }],
    now: '2026-10-25T00:00:00.000Z',
  });

  const allRecipes = [
    coffeeRecipe,
    largeCoffeeRecipe,
    bobaModifierRecipe,
    puddingModifierRecipe,
    croissantRecipe,
  ];

  it('deducts ingredients for base products and multiple modifiers', () => {
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
        {
          groupId: 'grp_topping',
          groupNameSnapshot: 'Topping',
          optionId: 'opt_pudding',
          optionNameSnapshot: 'Pudding trứng',
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

    const deductions = resolveBillDeductions(mockBill, allRecipes, 'pos_terminal');

    // 2 cups of coffee: 25g * 2 = 50g coffee beans; 30ml * 2 = 60ml milk
    // 2 portions of boba: 40g * 2 = 80g boba
    // 2 portions of pudding: 50g * 2 = 100g pudding
    const coffeeDeduction = deductions.find((d) => d.itemId === 'ing_coffee_beans');
    expect(coffeeDeduction?.qtyDelta).toBe(-50);
    expect(coffeeDeduction?.type).toBe('sale_deduction');
    expect(coffeeDeduction?.refId).toBe('b01');
    expect(coffeeDeduction?.branchId).toBe('dist1');

    const milkDeduction = deductions.find((d) => d.itemId === 'ing_condensed_milk');
    expect(milkDeduction?.qtyDelta).toBe(-60);

    const bobaDeduction = deductions.find((d) => d.itemId === 'ing_boba');
    expect(bobaDeduction?.qtyDelta).toBe(-80);

    const puddingDeduction = deductions.find((d) => d.itemId === 'ing_pudding');
    expect(puddingDeduction?.qtyDelta).toBe(-100);
  });

  it('prefers variant recipe over base product recipe when variantId is present', () => {
    const line: OrderLineItem = {
      lineId: 'l1',
      productId: 'prod_coffee',
      variantId: 'var_coffee_l',
      variantNameSnapshot: 'Size L',
      nameSnapshot: { vi: 'Cà phê sữa L', en: 'Milk Coffee L' },
      unitPriceSnapshot: money(45000, 'VND'),
      qty: 1,
      status: 'placed',
      addedAt: '2026-10-25T09:00:00.000Z',
      modifiers: [],
    };

    const mockBill = {
      _id: 'bill:dist1:b_var',
      branchId: 'dist1',
      billId: 'b_var',
      sessionId: 's_var',
      billNumber: 'BILL-VAR',
      status: 'paid',
      lines: [line],
    } as unknown as BillDoc;

    const deductions = resolveBillDeductions(mockBill, allRecipes, 'pos_terminal');

    const coffeeDeduction = deductions.find((d) => d.itemId === 'ing_coffee_beans');
    expect(coffeeDeduction?.qtyDelta).toBe(-35); // 35g for Large, not 25g

    const milkDeduction = deductions.find((d) => d.itemId === 'ing_condensed_milk');
    expect(milkDeduction?.qtyDelta).toBe(-45);
  });

  it('deducts ingredients for combo selections and sums common ingredients', () => {
    const comboLine: OrderLineItem = {
      lineId: 'l2',
      productId: 'combo_breakfast',
      nameSnapshot: { vi: 'Combo Sáng', en: 'Breakfast Combo' },
      unitPriceSnapshot: money(50000, 'VND'),
      qty: 2,
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

    const deductions = resolveBillDeductions(mockBill, allRecipes, 'pos_terminal');

    // 2 combos -> 2 coffees (2 * 25g = 50g coffee beans; 2 * 30ml = 60ml milk) + 2 croissants (2 * 1 = 2 pieces)
    const coffeeDeduction = deductions.find((d) => d.itemId === 'ing_coffee_beans');
    expect(coffeeDeduction?.qtyDelta).toBe(-50);

    const croissantDeduction = deductions.find((d) => d.itemId === 'ing_frozen_croissant');
    expect(croissantDeduction?.qtyDelta).toBe(-2);
  });

  it('ignores voided lines completely', () => {
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

    const deductions = resolveBillDeductions(mockBill, allRecipes, 'pos_terminal');
    expect(deductions).toHaveLength(0);
  });
});
