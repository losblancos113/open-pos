import { GLOBAL_BRANCH_ID } from '../db/branch';
import { inventoryRecipeDocId } from '../db/ids';
import type { CreateRecipeInput, InventoryRecipeDoc, RecipeIngredient, RecipeTargetType } from './types';

export const INVENTORY_RECIPE_DOC_TYPE = 'inventory_recipe';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

const VALID_TARGET_TYPES: ReadonlySet<string> = new Set(['product', 'variant', 'modifier']);

export function validateRecipe(doc: InventoryRecipeDoc): void {
  requireNonEmpty(doc.recipeId, 'recipeId');

  if (!VALID_TARGET_TYPES.has(doc.targetType)) {
    throw new Error('targetType must be "product", "variant", or "modifier"');
  }

  requireNonEmpty(doc.targetId, 'targetId');

  if (typeof doc.yieldQty !== 'number' || doc.yieldQty <= 0 || !Number.isFinite(doc.yieldQty)) {
    throw new Error('yieldQty must be a positive number');
  }

  if (!Array.isArray(doc.ingredients) || doc.ingredients.length === 0) {
    throw new Error('Recipe must have at least one ingredient');
  }

  for (const ing of doc.ingredients) {
    requireNonEmpty(ing.itemId, 'ingredient itemId');
    requireNonEmpty(ing.unit, 'ingredient unit');
    if (typeof ing.qty !== 'number' || ing.qty <= 0 || !Number.isFinite(ing.qty)) {
      throw new Error('Ingredient quantity must be positive');
    }
  }
}

export function createRecipeDoc(input: CreateRecipeInput): InventoryRecipeDoc {
  const recipeId = requireNonEmpty(input.recipeId, 'recipeId');

  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    throw new Error('targetType must be "product", "variant", or "modifier"');
  }

  const targetId = requireNonEmpty(input.targetId, 'targetId');
  const yieldQty = input.yieldQty ?? 1;

  if (yieldQty <= 0 || !Number.isFinite(yieldQty)) {
    throw new Error('yieldQty must be a positive number');
  }

  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error('Recipe must have at least one ingredient');
  }

  const ingredients: RecipeIngredient[] = input.ingredients.map((ing) => {
    const itemId = requireNonEmpty(ing.itemId, 'ingredient itemId');
    const unit = requireNonEmpty(ing.unit, 'ingredient unit');
    if (typeof ing.qty !== 'number' || ing.qty <= 0 || !Number.isFinite(ing.qty)) {
      throw new Error('Ingredient quantity must be positive');
    }
    return { itemId, qty: ing.qty, unit };
  });

  const now = input.now || new Date().toISOString();
  const branchId = input.branchId && input.branchId.trim() !== '' ? input.branchId.trim() : GLOBAL_BRANCH_ID;

  const doc: InventoryRecipeDoc = {
    _id: inventoryRecipeDocId(input.targetType, targetId),
    branchId,
    docType: INVENTORY_RECIPE_DOC_TYPE,
    schemaVersion: 1,
    recipeId,
    targetType: input.targetType,
    targetId,
    yieldQty,
    ingredients,
    createdAt: now,
    updatedAt: now,
  };

  validateRecipe(doc);
  return doc;
}
