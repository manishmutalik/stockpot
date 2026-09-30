import { IngredientRequirement, MenuItem, RawMaterial } from '../types';
import { convertAmount } from './conversions';

/** Material cost of one unit of a recipe at current material prices. */
export function recipeCost(recipe: IngredientRequirement[], materials: RawMaterial[]): number {
  return recipe.reduce((total, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return total;
    return total + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0);
  }, 0);
}

export type MarginTier = 'high' | 'mid' | 'low';

/** Margin at or above 60% is healthy, 40-60% is watch, below 40% (or a loss) needs review. */
export function getMarginInfo(sellingPrice: number, cost: number): { margin: number; tier: MarginTier; isLoss: boolean } {
  const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0;
  return {
    margin,
    tier: margin >= 60 ? 'high' : margin >= 40 ? 'mid' : 'low',
    isLoss: sellingPrice < cost,
  };
}

/** The "3.5x markup" price suggestion, rounded to cents. */
export const suggestedPrice = (cost: number) => parseFloat((cost * 3.5).toFixed(2));

export interface MenuSummary {
  itemCount: number;
  /** Average of cost / price across items that have both, as a percent; null if none do. */
  avgFoodCostPercent: number | null;
  best: { item: MenuItem; margin: number } | null;
  /** Items with no price or a margin below 40% (a loss included). */
  needsReview: MenuItem[];
}

export function summarizeMenu(menu: MenuItem[], materials: RawMaterial[]): MenuSummary {
  const costPercents: number[] = [];
  let best: MenuSummary['best'] = null;
  const needsReview: MenuItem[] = [];
  for (const item of menu) {
    const cost = recipeCost(item.recipe, materials);
    const price = item.sellingPrice || 0;
    if (price <= 0) { needsReview.push(item); continue; }
    if (cost > 0) costPercents.push((cost / price) * 100);
    const { margin, tier } = getMarginInfo(price, cost);
    if (item.recipe.length > 0 && (best === null || margin > best.margin)) best = { item, margin };
    if (tier === 'low') needsReview.push(item);
  }
  return {
    itemCount: menu.length,
    avgFoodCostPercent: costPercents.length > 0 ? costPercents.reduce((a, b) => a + b, 0) / costPercents.length : null,
    best,
    needsReview,
  };
}
