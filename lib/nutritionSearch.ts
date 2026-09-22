/**
 * nutritionSearch.ts
 *
 * Server-side lookup + normalization for the two free nutrition data
 * sources (USDA FoodData Central, Open Food Facts). Kept separate from
 * src/utils/nutritionCalculations.ts, which only ever reads nutrition data
 * already stored on a material and never makes a network call — this file
 * is the "fill the form" half of the feature, not the rollup math.
 *
 * Both search functions return the same normalized shape so the client
 * (and the route handlers below) can treat either source identically; the
 * per-source oddities (USDA's nutrient-number lookup, Open Food Facts'
 * `en:`-prefixed allergen tags) are translated here, once, rather than in
 * UI code.
 *
 * NOTE: these two APIs could not be exercised against live traffic while
 * writing this file (this environment's outbound network policy blocks
 * both api.nal.usda.gov and world.openfoodfacts.org). The shapes below
 * match each API's stable, documented contract, but treat this as
 * unverified against live responses until it's been smoke-tested from an
 * environment that can actually reach them.
 */
import axios from 'axios';
import { ALLERGEN_TAGS, AllergenTag } from '../src/utils/nutritionCalculations';

export interface NutritionSearchResult {
  id: string;
  name: string;
  brand?: string;
  /** Per 100g/ml, matching the convention used everywhere else in this
   * feature. Null if the source had no usable nutrient data for this
   * result (still returned, since e.g. Open Food Facts allergen data can
   * be useful even without full macros). */
  nutrition: { calories: number; protein: number; carbs: number; fat: number } | null;
  /** Always empty for USDA — it doesn't carry allergen data, which is
   * exactly why Open Food Facts is queried too, not just as a fallback. */
  allergens: AllergenTag[];
  source: 'usda' | 'openfoodfacts';
}

const ALLERGEN_TAG_SET = new Set<string>(ALLERGEN_TAGS);

// --- USDA FoodData Central -------------------------------------------------

/**
 * USDA's stable nutrient numbers for the four macros this feature tracks
 * (see https://fdc.nal.usda.gov/ — these numbers are documented and don't
 * change across dataTypes, unlike nutrientName's exact wording). Falling
 * back to a name search below covers the rare case where a result omits
 * `nutrientNumber` for a nutrient it does otherwise carry.
 */
const USDA_NUTRIENT_NUMBERS = {
  calories: '208',
  protein: '203',
  carbs: '205',
  fat: '204',
} as const;

export interface UsdaFoodNutrient {
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

/** Only the fields this module reads from USDA's `/foods/search` response —
 * not the full API shape. */
interface UsdaFoodSearchItem {
  fdcId: number;
  description?: string;
  foodNutrients?: UsdaFoodNutrient[];
}

/** Only the fields this module reads from Open Food Facts' product search
 * response — not the full API shape. */
interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number>;
  allergens_tags?: string[];
}

export function findUsdaNutrient(nutrients: UsdaFoodNutrient[], key: keyof typeof USDA_NUTRIENT_NUMBERS): number {
  const number = USDA_NUTRIENT_NUMBERS[key];
  const byNumber = nutrients.find(n => n.nutrientNumber === number);
  if (byNumber?.value !== undefined) return byNumber.value;

  const nameFallback: Record<keyof typeof USDA_NUTRIENT_NUMBERS, string> = {
    calories: 'energy',
    protein: 'protein',
    carbs: 'carbohydrate',
    fat: 'lipid',
  };
  const byName = nutrients.find(n => (n.nutrientName || '').toLowerCase().includes(nameFallback[key]));
  return byName?.value ?? 0;
}

/**
 * Searches USDA FoodData Central for generic (unbranded) ingredients.
 * Restricted to the Foundation/SR Legacy data types — USDA's own guidance
 * for "what's a plain ingredient's typical nutrition" queries, as opposed
 * to `Branded` entries meant for specific packaged products (Open Food
 * Facts already covers that case, with allergen data USDA lacks).
 */
export async function searchUsda(query: string, apiKey: string): Promise<NutritionSearchResult[]> {
  const response = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
    params: {
      query,
      api_key: apiKey,
      pageSize: 10,
      dataType: 'Foundation,SR Legacy',
    },
    timeout: 8000,
  });

  const foods: UsdaFoodSearchItem[] = response.data?.foods || [];
  return foods.map((food) => {
    const nutrients: UsdaFoodNutrient[] = food.foodNutrients || [];
    return {
      id: `usda-${food.fdcId}`,
      name: food.description || 'Unknown item',
      nutrition: {
        calories: findUsdaNutrient(nutrients, 'calories'),
        protein: findUsdaNutrient(nutrients, 'protein'),
        carbs: findUsdaNutrient(nutrients, 'carbs'),
        fat: findUsdaNutrient(nutrients, 'fat'),
      },
      allergens: [],
      source: 'usda' as const,
    };
  });
}

// --- Open Food Facts --------------------------------------------------------

/**
 * Maps Open Food Facts' `en:`-prefixed allergen tags onto this app's fixed
 * ALLERGEN_TAGS. Not exhaustive by design — anything OFF tags that this
 * app has no equivalent for is dropped rather than invented.
 *
 * `en:gluten` -> `wheat` is a deliberate simplification: OFF's gluten tag
 * also covers barley/rye, which aren't in ALLERGEN_TAGS, but wheat is by
 * far the dominant real-world source for a food business's ingredient
 * list, so it's the closest useful match rather than dropping it entirely.
 */
const OFF_ALLERGEN_TAG_MAP: Record<string, AllergenTag> = {
  'en:milk': 'milk',
  'en:eggs': 'eggs',
  'en:fish': 'fish',
  'en:crustaceans': 'shellfish',
  'en:molluscs': 'shellfish',
  'en:nuts': 'tree_nuts',
  'en:tree-nuts': 'tree_nuts',
  'en:peanuts': 'peanuts',
  'en:gluten': 'wheat',
  'en:soybeans': 'soybeans',
  'en:sesame-seeds': 'sesame',
  'en:sesame': 'sesame',
};

export function normalizeOffAllergens(allergensTags: string[] | undefined): AllergenTag[] {
  if (!allergensTags) return [];
  const mapped = new Set<AllergenTag>();
  allergensTags.forEach(tag => {
    const mappedTag = OFF_ALLERGEN_TAG_MAP[tag];
    if (mappedTag && ALLERGEN_TAG_SET.has(mappedTag)) mapped.add(mappedTag);
  });
  return Array.from(mapped);
}

export function offNutrition(nutriments: Record<string, number> | undefined) {
  if (!nutriments) return null;
  const calories = nutriments['energy-kcal_100g'];
  const protein = nutriments['proteins_100g'];
  const carbs = nutriments['carbohydrates_100g'];
  const fat = nutriments['fat_100g'];
  if ([calories, protein, carbs, fat].every(v => v === undefined || v === null)) {
    return null;
  }
  return {
    calories: calories ?? 0,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
  };
}

/**
 * Searches Open Food Facts for branded products by name. This is the
 * primary allergen data source for this feature (see `NutritionSearchResult`)
 * — USDA doesn't carry allergen data at all, so this is queried in
 * parallel with USDA on every lookup, not as a fallback when USDA comes up
 * empty (that would rarely surface allergen data at all in practice).
 */
export async function searchOpenFoodFacts(query: string): Promise<NutritionSearchResult[]> {
  const response = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
    params: {
      search_terms: query,
      search_simple: 1,
      action: 'process',
      json: 1,
      page_size: 10,
      fields: 'code,product_name,brands,nutriments,allergens_tags',
    },
    timeout: 8000,
  });

  const products: OffProduct[] = response.data?.products || [];
  return products
    .filter((product) => product.product_name)
    .map((product) => ({
      id: `off-${product.code}`,
      name: product.product_name,
      brand: product.brands || undefined,
      nutrition: offNutrition(product.nutriments),
      allergens: normalizeOffAllergens(product.allergens_tags),
      source: 'openfoodfacts' as const,
    }));
}
