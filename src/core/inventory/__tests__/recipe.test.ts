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
    expect(doc.targetType).toBe('product');
    expect(doc.targetId).toBe('prod_latte');
    expect(doc.branchId).toBe('*');
    expect(doc.yieldQty).toBe(1);
    expect(doc.ingredients).toHaveLength(2);
    expect(doc.ingredients[0]?.qty).toBe(20);
    expect(doc.ingredients[0]?.itemId).toBe('ing_coffee_beans');
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
    expect(doc.targetId).toBe('opt_boba');
  });

  it('creates a recipe for a product variant', () => {
    const doc = createRecipeDoc({
      recipeId: 'rec_latte_large',
      targetType: 'variant',
      targetId: 'var_latte_l',
      yieldQty: 1,
      ingredients: [
        { itemId: 'ing_coffee_beans', qty: 30, unit: 'g' },
        { itemId: 'ing_fresh_milk', qty: 220, unit: 'ml' },
      ],
      now: '2026-10-25T10:00:00.000Z',
    });

    expect(doc._id).toBe('inventory_recipe:variant:var_latte_l');
    expect(doc.targetType).toBe('variant');
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

    expect(() =>
      createRecipeDoc({
        recipeId: 'rec_invalid3',
        targetType: 'product',
        targetId: 'prod_1',
        ingredients: [{ itemId: 'ing_1', qty: -5, unit: 'g' }],
        now: '2026-10-25T10:00:00.000Z',
      })
    ).toThrow('Ingredient quantity must be positive');
  });

  it('rejects invalid targetType or empty targetId', () => {
    expect(() =>
      createRecipeDoc({
        recipeId: 'rec_invalid4',
        targetType: 'invalid' as unknown as 'product',
        targetId: 'prod_1',
        ingredients: [{ itemId: 'ing_1', qty: 10, unit: 'g' }],
      })
    ).toThrow('targetType must be "product", "variant", or "modifier"');

    expect(() =>
      createRecipeDoc({
        recipeId: 'rec_invalid5',
        targetType: 'product',
        targetId: '',
        ingredients: [{ itemId: 'ing_1', qty: 10, unit: 'g' }],
      })
    ).toThrow('targetId must be a non-empty string');
  });

  it('validates an existing recipe doc', () => {
    const doc = createRecipeDoc({
      recipeId: 'rec_ok',
      targetType: 'product',
      targetId: 'prod_ok',
      ingredients: [{ itemId: 'ing_ok', qty: 5, unit: 'g' }],
    });

    expect(() => validateRecipe(doc)).not.toThrow();
  });
});
