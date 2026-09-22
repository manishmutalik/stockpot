/**
 * nutritionCalculations.ts
 *
 * Pure nutrition/allergen rollup math for menu items, kept dependency-free
 * so it can be unit tested without mocking Firebase/App.tsx's module graph
 * (see conversions.ts and gstCalculations.ts for the same reasoning).
 *
 * This module only ever reads nutrition/allergen data already stored on a
 * material — it never calls an external API. Lookup-and-fill against USDA
 * FoodData Central / Open Food Facts is a separate concern (server routes +
 * UI), kept out of this file so the rollup math stays trivially testable.
 */
import { convertAmount } from './conversions';

/**
 * Fixed allergen tags. Deliberately not free text — a superset of the US
 * "Big 9" major allergens, which also covers most FSSAI-flagged allergens
 * relevant for the India market. Keep this list stable; UI code should
 * import it rather than hardcode allergen names anywhere.
 */
export const ALLERGEN_TAGS = [
  'milk', 'eggs', 'fish', 'shellfish', 'tree_nuts',
  'peanuts', 'wheat', 'soybeans', 'sesame',
] as const;

export type AllergenTag = typeof ALLERGEN_TAGS[number];

/** Nutrition facts per 100g/ml of a material — see the doc comment on
 * `RawMaterial.nutrition` in types/index.ts for the "per 100, regardless of
 * stock unit" convention this represents. */
export interface MaterialNutrition {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
}

/** The minimal shape `calculateRecipeNutrition` needs from a material —
 * matches (a subset of) `RawMaterial`, kept local so this module doesn't
 * need to import the full app type graph. */
export interface MaterialForNutrition {
  id: string;
  unit: string;
  nutrition?: MaterialNutrition;
  allergens?: string[];
}

/** The minimal shape of a recipe ingredient line — matches
 * `IngredientRequirement` in types/index.ts. */
export interface RecipeIngredientForNutrition {
  materialId: string;
  amount: number;
  unit: string;
}

export interface NutritionRollup {
  perServing: MaterialNutrition;
  allergens: AllergenTag[];
  /** True if one or more recipe ingredients has no nutrition data on file,
   * or the recipe references a material that no longer exists, or the
   * yield is missing/zero — the rollup is a partial (or entirely absent)
   * estimate, and the UI must show this clearly rather than silently
   * presenting an incomplete number as complete. */
  hasIncompleteData: boolean;
}

const ZERO_NUTRITION: MaterialNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * A material's `nutrition` is always entered per 100g or per 100ml — never
 * per 100 of whatever unit it happens to be stocked in (see the design
 * constraint on this in the feature spec: "stocked in kg but nutrition
 * entered per 100g" must still work). So before scaling, a recipe amount
 * needs converting into the *basis* unit matching the material's unit
 * family (kg -> g, l -> ml), not into the material's raw `unit` the way
 * recipe costing converts amounts. `pcs`-based materials have no g/ml
 * basis to convert into; nutrition for those is simply per-100-pieces, and
 * `unit` already equals that basis, so it passes through unchanged.
 */
function nutritionBasisUnit(materialUnit: string): string {
  if (materialUnit === 'kg') return 'g';
  if (materialUnit === 'l') return 'ml';
  return materialUnit;
}

/**
 * Computes estimated per-serving nutrition and allergen info for a recipe.
 *
 * Mirrors the existing recipe-cost rollup pattern (see `getFinancialsForRange`
 * in App.tsx): for each ingredient, convert its recipe-unit amount into the
 * material's nutrition-basis unit (reusing `convertAmount()` from
 * conversions.ts — do not reimplement unit conversion here), scale that
 * material's per-100-basis-unit nutrition proportionally, sum across all
 * ingredients, then divide by the recipe's yield to get a per-serving figure.
 *
 * Allergens roll up as a union: if any ingredient carries a tag, the whole
 * recipe carries it. Never drop an allergen tag due to small quantity —
 * cross-contamination risk doesn't scale down with amount used, so allergen
 * rollup deliberately ignores `hasIncompleteData`/quantity entirely.
 *
 * @param recipe        - The menu item's ingredient lines.
 * @param materials     - All known materials (only the ones referenced by
 *                        `recipe` are used; lookup is by `materialId`).
 * @param yieldQuantity - How many servings/units this recipe produces.
 *                        Zero, negative, or missing yield can't be divided
 *                        into, so it short-circuits to a zeroed rollup
 *                        marked incomplete rather than Infinity/NaN.
 */
export function calculateRecipeNutrition(
  recipe: RecipeIngredientForNutrition[],
  materials: MaterialForNutrition[],
  yieldQuantity: number
): NutritionRollup {
  if (!yieldQuantity || yieldQuantity <= 0) {
    return { perServing: ZERO_NUTRITION, allergens: [], hasIncompleteData: true };
  }

  const totals: MaterialNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const allergenSet = new Set<AllergenTag>();
  let hasIncompleteData = false;

  recipe.forEach(req => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) {
      hasIncompleteData = true;
      return;
    }

    (mat.allergens || []).forEach(tag => {
      if ((ALLERGEN_TAGS as readonly string[]).includes(tag)) {
        allergenSet.add(tag as AllergenTag);
      }
    });

    if (!mat.nutrition) {
      hasIncompleteData = true;
      return;
    }

    const basisUnit = nutritionBasisUnit(mat.unit);
    const amountInBasisUnit = convertAmount(req.amount, req.unit || 'g', basisUnit);
    const factor = amountInBasisUnit / 100;

    totals.calories += mat.nutrition.calories * factor;
    totals.protein += mat.nutrition.protein * factor;
    totals.carbs += mat.nutrition.carbs * factor;
    totals.fat += mat.nutrition.fat * factor;
  });

  return {
    perServing: {
      calories: totals.calories / yieldQuantity,
      protein: totals.protein / yieldQuantity,
      carbs: totals.carbs / yieldQuantity,
      fat: totals.fat / yieldQuantity,
    },
    allergens: Array.from(allergenSet),
    hasIncompleteData,
  };
}

/** Exact, required wording for every generated nutrition card — this is
 * informational estimate data, not a certified/compliant nutrition label,
 * and the disclaimer must say so verbatim everywhere the rollup is shown
 * to a customer. */
export const NUTRITION_DISCLAIMER =
  'Estimated based on standard ingredient data — not lab-verified. Please consult us directly about specific dietary or allergy concerns.';
