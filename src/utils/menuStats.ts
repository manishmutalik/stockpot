import { IngredientRequirement, MenuItem, RawMaterial } from '../types';
import { convertAmount } from './conversions';
import { basePriceOf, type GstPricingMode } from './gstCalculations';
import { costMenu } from './itemParts';

/**
 * Material cost of one unit of a recipe at current material prices. For an item made from other items, pass its recipe
 * as costing sees it (utils/itemParts `costView`), so its parts are counted.
 */
export function recipeCost(recipe: IngredientRequirement[], materials: RawMaterial[]): number {
  return recipe.reduce((total, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return total;
    return total + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0);
  }, 0);
}

/**
 * The names of the materials in an item's recipe (as costing sees it: `costView`) that have no price yet (a material the recipe reader created without
 * one). While there are any, the item's cost is too low and is shown as "cost incomplete".
 */
export function unpricedMaterials(item: Pick<MenuItem, 'recipe'>, materials: RawMaterial[]): string[] {
  const names = new Set<string>();
  for (const req of item.recipe ?? []) {
    const mat = materials.find(m => m.id === req.materialId);
    if (mat && !(mat.costPerUnit > 0)) names.add(mat.name);
  }
  return [...names];
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

export interface MenuSummary {
  itemCount: number;
  /** Average of cost / price across items that have both, as a percent; null if none do. */
  avgFoodCostPercent: number | null;
  best: { item: MenuItem; margin: number } | null;
  /** Items with no price or a margin below 40% (a loss included). */
  needsReview: MenuItem[];
}

/**
 * `settings` makes the margins GST-aware: in inclusive pricing the price has GST inside it, and a margin is
 * worked out on what the business keeps (the pre-GST price), like revenue everywhere else.
 */
export function summarizeMenu(
  menu: MenuItem[],
  materials: RawMaterial[],
  settings: { gstApplicable?: boolean; gstRate?: number; gstPricingMode?: GstPricingMode } = {}
): MenuSummary {
  const costPercents: number[] = [];
  let best: MenuSummary['best'] = null;
  const needsReview: MenuItem[] = [];
  // Items made only for other items have no price of their own: they are not part of the menu's figures.
  for (const item of costMenu(menu).filter(m => !m.notForSale)) {
    const cost = recipeCost(item.recipe, materials);
    const price = basePriceOf(item.sellingPrice || 0, settings);
    if (price <= 0) { needsReview.push(item); continue; }
    if (cost > 0) costPercents.push((cost / price) * 100);
    const { margin, tier } = getMarginInfo(price, cost);
    if (item.recipe.length > 0 && (best === null || margin > best.margin)) best = { item, margin };
    if (tier === 'low') needsReview.push(item);
  }
  return {
    itemCount: menu.filter(m => !m.notForSale).length,
    avgFoodCostPercent: costPercents.length > 0 ? costPercents.reduce((a, b) => a + b, 0) / costPercents.length : null,
    best,
    needsReview,
  };
}

/** The periods the Menu screen can show each product's sales over. */
export type SalesPeriod = '7' | '30' | '90' | 'all';

export const SALES_PERIODS: { value: SalesPeriod; label: string; phrase: string }[] = [
  { value: '7', label: 'Last 7 days', phrase: 'in the last 7 days' },
  { value: '30', label: 'Last 30 days', phrase: 'in the last 30 days' },
  { value: '90', label: 'Last 90 days', phrase: 'in the last 90 days' },
  { value: 'all', label: 'All time', phrase: 'yet' },
];

/** Inclusive YYYY-MM-DD bounds of a period ending today ('all' has no start). */
export function salesPeriodRange(period: SalesPeriod, today: string): { start: string | null; end: string } {
  if (period === 'all') return { start: null, end: today };
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - (Number(period) - 1)));
  return { start: start.toISOString().split('T')[0], end: today };
}
