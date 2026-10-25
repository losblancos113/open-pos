import type { BillDoc, OrderLineItem } from '../order/types';
import type { CreateMovementInput, InventoryRecipeDoc } from './types';

export function resolveBillDeductions(
  bill: BillDoc,
  recipes: readonly InventoryRecipeDoc[],
  actorId: string,
): readonly CreateMovementInput[] {
  const branchId = bill.branchId;
  const billId =
    (bill as unknown as { billId?: string }).billId ||
    bill._id.split(':').slice(2).join(':') ||
    bill._id;

  const recipeMap = new Map<string, InventoryRecipeDoc>();
  for (const r of recipes) {
    recipeMap.set(`${r.targetType}:${r.targetId}`, r);
  }

  // Map of itemId -> { qty: number, unit: string }
  const itemDeductions = new Map<string, { qty: number; unit: string }>();

  function addDeduction(itemId: string, unit: string, qty: number): void {
    const existing = itemDeductions.get(itemId);
    if (existing) {
      existing.qty += qty;
    } else {
      itemDeductions.set(itemId, { qty, unit });
    }
  }

  function applyRecipe(recipe: InventoryRecipeDoc, multiplier: number): void {
    const yieldQty = recipe.yieldQty > 0 ? recipe.yieldQty : 1;
    const factor = multiplier / yieldQty;
    for (const ing of recipe.ingredients) {
      addDeduction(ing.itemId, ing.unit, ing.qty * factor);
    }
  }

  for (const line of bill.lines) {
    if (line.status === 'voided') {
      continue;
    }

    const lineQty = line.qty;
    if (lineQty <= 0) {
      continue;
    }

    // 1. Base product or variant recipe
    if (line.variantId) {
      const variantRecipe = recipeMap.get(`variant:${line.variantId}`);
      if (variantRecipe) {
        applyRecipe(variantRecipe, lineQty);
      } else {
        const productRecipe = recipeMap.get(`product:${line.productId}`);
        if (productRecipe) {
          applyRecipe(productRecipe, lineQty);
        }
      }
    } else {
      const productRecipe = recipeMap.get(`product:${line.productId}`);
      if (productRecipe) {
        applyRecipe(productRecipe, lineQty);
      }
    }

    // 2. Modifiers
    if (line.modifiers && line.modifiers.length > 0) {
      for (const mod of line.modifiers) {
        // Match modifier option ID directly or groupId:optionId
        const modRecipe =
          recipeMap.get(`modifier:${mod.optionId}`) ||
          recipeMap.get(`modifier:${mod.groupId}:${mod.optionId}`);
        if (modRecipe) {
          applyRecipe(modRecipe, lineQty);
        }
      }
    }

    // 3. Combos
    if (line.comboSelections && line.comboSelections.length > 0) {
      for (const sel of line.comboSelections) {
        for (const optId of sel.optionIds) {
          const comboItemRecipe =
            recipeMap.get(`product:${optId}`) || recipeMap.get(`variant:${optId}`);
          if (comboItemRecipe) {
            applyRecipe(comboItemRecipe, lineQty);
          }
        }
      }
    }
  }

  const results: CreateMovementInput[] = [];
  for (const [itemId, { qty, unit }] of itemDeductions.entries()) {
    results.push({
      branchId,
      type: 'sale_deduction',
      itemId,
      qtyDelta: -qty, // negative for deductions
      unit,
      refId: billId,
      actorId,
    });
  }

  return results;
}
