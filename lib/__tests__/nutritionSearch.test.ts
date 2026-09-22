import { describe, it, expect } from 'vitest';
import {
  findUsdaNutrient,
  normalizeOffAllergens,
  offNutrition,
  type UsdaFoodNutrient,
} from '../nutritionSearch';

describe('findUsdaNutrient', () => {
  const nutrients: UsdaFoodNutrient[] = [
    { nutrientNumber: '208', nutrientName: 'Energy', unitName: 'KCAL', value: 364 },
    { nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 10.3 },
    { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 76.3 },
    { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', unitName: 'G', value: 1 },
  ];

  it('finds each macro by its stable USDA nutrient number', () => {
    expect(findUsdaNutrient(nutrients, 'calories')).toBe(364);
    expect(findUsdaNutrient(nutrients, 'protein')).toBe(10.3);
    expect(findUsdaNutrient(nutrients, 'carbs')).toBe(76.3);
    expect(findUsdaNutrient(nutrients, 'fat')).toBe(1);
  });

  it('falls back to a name match when nutrientNumber is missing', () => {
    const noNumbers: UsdaFoodNutrient[] = [
      { nutrientName: 'Energy', unitName: 'KCAL', value: 52 },
      { nutrientName: 'Protein', unitName: 'G', value: 0.3 },
    ];
    expect(findUsdaNutrient(noNumbers, 'calories')).toBe(52);
    expect(findUsdaNutrient(noNumbers, 'protein')).toBe(0.3);
  });

  it('returns 0 when a macro is entirely absent', () => {
    expect(findUsdaNutrient([], 'fat')).toBe(0);
  });
});

describe('offNutrition', () => {
  it('returns null when nutriments is missing', () => {
    expect(offNutrition(undefined)).toBeNull();
  });

  it('returns null when all four macro fields are absent', () => {
    expect(offNutrition({ 'some-other-field_100g': 5 })).toBeNull();
  });

  it('extracts the four per-100g macro fields', () => {
    const result = offNutrition({
      'energy-kcal_100g': 250,
      'proteins_100g': 8,
      'carbohydrates_100g': 30,
      'fat_100g': 10,
    });
    expect(result).toEqual({ calories: 250, protein: 8, carbs: 30, fat: 10 });
  });

  it('defaults an individually-missing field to 0 rather than dropping the whole result', () => {
    const result = offNutrition({
      'energy-kcal_100g': 250,
      'proteins_100g': 8,
      // carbohydrates_100g missing
      'fat_100g': 10,
    });
    expect(result).toEqual({ calories: 250, protein: 8, carbs: 0, fat: 10 });
  });
});

describe('normalizeOffAllergens', () => {
  it('returns an empty array for undefined input', () => {
    expect(normalizeOffAllergens(undefined)).toEqual([]);
  });

  it('maps recognized en: tags onto ALLERGEN_TAGS', () => {
    const result = normalizeOffAllergens(['en:milk', 'en:peanuts', 'en:sesame-seeds']);
    expect(result.sort()).toEqual(['milk', 'peanuts', 'sesame']);
  });

  it('drops tags with no equivalent in ALLERGEN_TAGS', () => {
    expect(normalizeOffAllergens(['en:mustard', 'en:celery'])).toEqual([]);
  });

  it('maps both crustaceans and molluscs onto the single shellfish tag, without duplicates', () => {
    const result = normalizeOffAllergens(['en:crustaceans', 'en:molluscs']);
    expect(result).toEqual(['shellfish']);
  });

  it('maps gluten onto wheat as a deliberate best-effort simplification', () => {
    expect(normalizeOffAllergens(['en:gluten'])).toEqual(['wheat']);
  });
});
