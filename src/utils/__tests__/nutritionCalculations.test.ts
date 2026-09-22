import { describe, it, expect } from 'vitest';
import {
  calculateRecipeNutrition,
  ALLERGEN_TAGS,
  type MaterialForNutrition,
} from '../nutritionCalculations';

const flourPer100g: MaterialForNutrition = {
  id: 'flour',
  unit: 'kg',
  nutrition: { calories: 364, protein: 10, carbs: 76, fat: 1 },
  allergens: ['wheat'],
};

const milkPer100ml: MaterialForNutrition = {
  id: 'milk',
  unit: 'l',
  nutrition: { calories: 42, protein: 3.4, carbs: 5, fat: 1 },
  allergens: ['milk'],
};

const eggPer100Pcs: MaterialForNutrition = {
  id: 'egg',
  unit: 'pcs',
  nutrition: { calories: 14300, protein: 1260, carbs: 70, fat: 950 }, // ~143 kcal/egg * 100
  allergens: ['eggs'],
};

const noDataMaterial: MaterialForNutrition = {
  id: 'mystery',
  unit: 'g',
};

describe('calculateRecipeNutrition', () => {
  it('returns a zeroed, incomplete rollup for zero yield', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'flour', amount: 500, unit: 'g' }],
      [flourPer100g],
      0
    );
    expect(result).toEqual({
      perServing: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      allergens: [],
      hasIncompleteData: true,
    });
  });

  it('returns a zeroed, incomplete rollup for negative or missing yield', () => {
    expect(calculateRecipeNutrition([], [], -1).hasIncompleteData).toBe(true);
    expect(calculateRecipeNutrition([], [], undefined as unknown as number).hasIncompleteData).toBe(true);
  });

  it('scales a gram-based recipe amount against per-100g nutrition', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'flour', amount: 200, unit: 'g' }],
      [flourPer100g],
      1
    );
    // 200g is 2x the 100g basis
    expect(result.perServing.calories).toBeCloseTo(728, 6);
    expect(result.perServing.protein).toBeCloseTo(20, 6);
    expect(result.hasIncompleteData).toBe(false);
  });

  it('converts a kg-stocked material\'s recipe amount into the g basis before scaling', () => {
    // Material is stocked in kg, nutrition is per 100g, recipe uses kg directly.
    const result = calculateRecipeNutrition(
      [{ materialId: 'flour', amount: 0.5, unit: 'kg' }],
      [flourPer100g],
      1
    );
    // 0.5kg = 500g = 5x the 100g basis
    expect(result.perServing.calories).toBeCloseTo(1820, 6);
    expect(result.hasIncompleteData).toBe(false);
  });

  it('converts an l-stocked material\'s recipe amount into the ml basis before scaling', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'milk', amount: 250, unit: 'ml' }],
      [milkPer100ml],
      1
    );
    // 250ml is 2.5x the 100ml basis
    expect(result.perServing.calories).toBeCloseTo(105, 6);
    expect(result.perServing.fat).toBeCloseTo(2.5, 6);
    expect(result.hasIncompleteData).toBe(false);
  });

  it('treats a pcs-stocked material as per-100-pieces', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'egg', amount: 2, unit: 'pcs' }],
      [eggPer100Pcs],
      1
    );
    // 2 pcs is 2% of the 100-piece basis
    expect(result.perServing.calories).toBeCloseTo(286, 6);
    expect(result.hasIncompleteData).toBe(false);
  });

  it('divides summed nutrition by the yield to get a per-serving figure', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'flour', amount: 200, unit: 'g' }],
      [flourPer100g],
      4
    );
    expect(result.perServing.calories).toBeCloseTo(728 / 4, 6);
  });

  it('marks the rollup incomplete when a referenced material is missing, but still totals the rest', () => {
    const result = calculateRecipeNutrition(
      [
        { materialId: 'flour', amount: 200, unit: 'g' },
        { materialId: 'does-not-exist', amount: 50, unit: 'g' },
      ],
      [flourPer100g],
      1
    );
    expect(result.hasIncompleteData).toBe(true);
    expect(result.perServing.calories).toBeCloseTo(728, 6);
  });

  it('marks the rollup incomplete when a material has no nutrition data, but still collects its allergens', () => {
    const withAllergenNoNutrition: MaterialForNutrition = {
      id: 'mystery-allergen',
      unit: 'g',
      allergens: ['soybeans'],
    };
    const result = calculateRecipeNutrition(
      [{ materialId: 'mystery-allergen', amount: 50, unit: 'g' }],
      [withAllergenNoNutrition],
      1
    );
    expect(result.hasIncompleteData).toBe(true);
    expect(result.allergens).toEqual(['soybeans']);
    expect(result.perServing).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('unions allergens across ingredients without duplicates', () => {
    const result = calculateRecipeNutrition(
      [
        { materialId: 'flour', amount: 200, unit: 'g' },
        { materialId: 'milk', amount: 100, unit: 'ml' },
        { materialId: 'flour', amount: 50, unit: 'g' }, // same allergen twice
      ],
      [flourPer100g, milkPer100ml],
      1
    );
    expect(result.allergens.sort()).toEqual(['milk', 'wheat']);
  });

  it('never drops an allergen for a small quantity', () => {
    const result = calculateRecipeNutrition(
      [{ materialId: 'flour', amount: 0.001, unit: 'g' }],
      [flourPer100g],
      1
    );
    expect(result.allergens).toEqual(['wheat']);
  });

  it('ignores an allergen tag on a material that is not in ALLERGEN_TAGS', () => {
    const weirdTagMaterial: MaterialForNutrition = {
      id: 'weird',
      unit: 'g',
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      allergens: ['gluten-free-claim' as any],
    };
    const result = calculateRecipeNutrition(
      [{ materialId: 'weird', amount: 10, unit: 'g' }],
      [weirdTagMaterial],
      1
    );
    expect(result.allergens).toEqual([]);
  });

  it('handles a multi-ingredient recipe with mixed unit families end to end', () => {
    const result = calculateRecipeNutrition(
      [
        { materialId: 'flour', amount: 0.5, unit: 'kg' }, // 500g -> 5x
        { materialId: 'milk', amount: 250, unit: 'ml' },  // 2.5x
        { materialId: 'egg', amount: 2, unit: 'pcs' },    // 2x (of 100pcs basis, i.e. 2%)
        { materialId: 'mystery', amount: 10, unit: 'g' }, // no data
      ],
      [flourPer100g, milkPer100ml, eggPer100Pcs, noDataMaterial],
      2 // yield: 2 servings
    );

    const expectedTotalCalories = 364 * 5 + 42 * 2.5 + 14300 * 0.02;
    expect(result.perServing.calories).toBeCloseTo(expectedTotalCalories / 2, 6);
    expect(result.hasIncompleteData).toBe(true);
    expect(result.allergens.sort()).toEqual(['eggs', 'milk', 'wheat']);
  });

  it('exports the fixed allergen tag list as the single source of truth', () => {
    expect(ALLERGEN_TAGS).toEqual([
      'milk', 'eggs', 'fish', 'shellfish', 'tree_nuts',
      'peanuts', 'wheat', 'soybeans', 'sesame',
    ]);
  });
});
