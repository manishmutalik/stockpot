/**
 * pricing.ts
 *
 * Price & Margin Intelligence ("Price Me"): ingredient price stats, margin drift,
 * target-margin prices and what-if pricing. Plain arithmetic over data the app
 * already holds, no AI. Margins are always on the pre-GST price, and sales
 * volumes and contribution come from `profit.ts`, so a margin here can never
 * disagree with the one on the Orders screen.
 *
 * Rules that matter:
 *  - Never invent history: a comparison with nothing old enough to compare to is
 *    `null` ("not enough history yet"), never 0.
 *  - Price drift is separate from recipe edits: "butter is up 14%" is only said
 *    about price moves. A recipe edit shows up as `recipeChangeImpact`.
 *  - No surprise changes: with no target set, the suggested price is the old 3.5x
 *    markup and nothing is flagged as below target.
 *
 * Pure: no React, Firebase or DOM.
 */
import type { BakerySettings, MenuItem, Order, PriceLogEntry, RawMaterial } from '../types';
import { convertAmount } from './conversions';
import { basePriceOf } from './gstCalculations';
import { addDays, daysBetween } from './localDate';
import { recipeCost } from './menuStats';
import { priceHistory } from './priceLog';
import { productProfits } from './profit';
import { actualOrders } from './preorders';

/** The target that reproduces the old 3.5x markup exactly: 1 - 1/3.5. */
export const DEFAULT_TARGET_MARGIN = 100 * (1 - 1 / 3.5);
export const DEFAULT_ALERT_POINTS = 5;
export const DEFAULT_PRICE_ROUNDING = 5;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (now: number, before: number) => ((now - before) / before) * 100;

type GstSettings = Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;

/** Gross margin % of a menu price at a unit cost, on the pre-GST price. 0 when there is no price. */
export function marginOf(menuPrice: number, unitCost: number, settings: GstSettings): number {
  const base = basePriceOf(menuPrice, settings);
  return base > 0 ? ((base - unitCost) / base) * 100 : 0;
}

/** The target an item is held to, and whether the owner actually set it (a default of "none" is not a target). */
export function targetFor(item: Pick<MenuItem, 'targetMargin'>, settings: Pick<BakerySettings, 'defaultTargetMargin'>): { margin: number; explicit: boolean } {
  const own = item.targetMargin;
  if (typeof own === 'number' && own > 0 && own < 100) return { margin: own, explicit: true };
  const dflt = settings.defaultTargetMargin;
  if (typeof dflt === 'number' && dflt > 0 && dflt < 100) return { margin: dflt, explicit: true };
  return { margin: DEFAULT_TARGET_MARGIN, explicit: false };
}

/* ------------------------------------------------------------------------------------------------
 * 1. Material price stats
 * ---------------------------------------------------------------------------------------------- */

export interface MaterialPriceStats {
  /** Price of the most recent purchase, per the material's current unit. */
  lastPrice: number | null;
  lastPurchaseDate: string | null;
  /** Average price paid over the last 90 days, weighted by the quantity bought. */
  avgPrice90d: number | null;
  /** % change of the last price against the latest purchase on or before 30 days ago. Null without one. */
  change30d: number | null;
  change90d: number | null;
  hasEnoughHistory: { d30: boolean; d90: boolean };
}

/**
 * What the price log says about one material's purchase price. Only purchases (restocks and goods receipts)
 * count; opening costs and hand edits are corrections, not prices paid. Entries recorded in a unit that does
 * not convert to the material's current unit are left out rather than guessed at.
 */
export function materialPriceStats(
  material: Pick<RawMaterial, 'id' | 'unit'>,
  log: PriceLogEntry[],
  today: string
): MaterialPriceStats {
  const purchases = log.filter(e => e.source === 'restock' || e.source === 'goods_receipt');
  const rows = priceHistory(purchases, material)
    .filter(r => r.date <= today && r.unit === (material.unit || 'g') && r.unitCost > 0); // newest first
  const last = rows[0];

  const compareAgainst = (days: number) => rows.find(r => r.date <= addDays(today, -days)) ?? null;
  const changeAgainst = (days: number) => {
    const old = compareAgainst(days);
    return last && old ? { has: true, change: pct(last.unitCost, old.unitCost) } : { has: false, change: null };
  };
  const c30 = changeAgainst(30);
  const c90 = changeAgainst(90);

  const window = rows.filter(r => r.date > addDays(today, -90));
  const weighted = window.filter(r => (r.quantity ?? 0) > 0);
  let avg: number | null = null;
  if (weighted.length > 0) {
    const qty = weighted.reduce((s, r) => s + r.quantity!, 0);
    avg = weighted.reduce((s, r) => s + r.unitCost * r.quantity!, 0) / qty;
  } else if (window.length > 0) {
    avg = window.reduce((s, r) => s + r.unitCost, 0) / window.length;
  }

  return {
    lastPrice: last?.unitCost ?? null,
    lastPurchaseDate: last?.date ?? null,
    avgPrice90d: avg,
    change30d: c30.change,
    change90d: c90.change,
    hasEnoughHistory: { d30: c30.has, d90: c90.has },
  };
}

export interface RecipeAffected {
  menuItemId: string;
  /** Share of the item's unit cost this material makes up, 0 to 1. */
  costShare: number;
  /** What a 10% rise in the material's price adds to the item's unit cost. */
  unitCostImpactOf10pct: number;
}

/** The menu items that use a material: how much of their cost it is, and what a 10% rise would add. Biggest impact first. */
export function recipesAffectedBy(materialId: string, menu: MenuItem[], materials: RawMaterial[]): RecipeAffected[] {
  const material = materials.find(m => m.id === materialId);
  if (!material) return [];
  const out: RecipeAffected[] = [];
  for (const item of menu) {
    const lines = item.recipe.filter(r => r.materialId === materialId);
    if (lines.length === 0) continue;
    const mine = lines.reduce((s, r) => s + convertAmount(r.amount, r.unit || 'g', material.unit) * (material.costPerUnit || 0), 0);
    const total = recipeCost(item.recipe, materials);
    out.push({ menuItemId: item.id, costShare: total > 0 ? mine / total : 0, unitCostImpactOf10pct: mine * 0.1 });
  }
  return out.sort((a, b) => b.unitCostImpactOf10pct - a.unitCostImpactOf10pct);
}

/* ------------------------------------------------------------------------------------------------
 * 2. Margin drift
 * ---------------------------------------------------------------------------------------------- */

export interface MarginDriver {
  materialId: string;
  /** How much the material's price moved since the item was priced; null if it had no price then. */
  pctChange: number | null;
  /** What that move did to the item's unit cost (positive = costs more). */
  costImpact: number;
}

export interface MarginDrift {
  marginAtPricing: number;
  marginNow: number;
  /** Margin lost since pricing (negative if it improved). */
  pointsLost: number;
  costAtPricing: number;
  costNow: number;
  /** Ingredients whose price moved, the biggest cost impact first. */
  drivers: MarginDriver[];
  /** Cost change that comes from editing the recipe (amounts, additions, removals), not from prices. */
  recipeChangeImpact: number;
  alert: 'below_target' | 'slipped' | null;
}

/**
 * How an item's margin has moved since it was priced, and why. The cost change splits in two that add up:
 * the price moves of the materials the item still uses (at today's amounts), and whatever is left, which is
 * the recipe having been edited. Null when the item has no price, no recipe cost or no pricing stamp.
 */
export function marginDrift(item: MenuItem, materials: RawMaterial[], settings: BakerySettings): MarginDrift | null {
  const costAtPricing = item.costAtPricing;
  const stamped = item.materialCostsAtPricing;
  if (!(item.sellingPrice > 0) || typeof costAtPricing !== 'number' || !stamped) return null;
  const costNow = recipeCost(item.recipe, materials);
  if (costNow <= 0 && costAtPricing <= 0) return null;

  const marginAtPricing = marginOf(item.sellingPrice, costAtPricing, settings);
  const marginNow = marginOf(item.sellingPrice, costNow, settings);

  const byMaterial = new Map<string, number>();
  for (const req of item.recipe) {
    const mat = materials.find(m => m.id === req.materialId);
    const before = stamped[req.materialId];
    if (!mat || typeof before !== 'number') continue; // added since pricing: part of the recipe change
    byMaterial.set(req.materialId, (byMaterial.get(req.materialId) ?? 0) + convertAmount(req.amount, req.unit || 'g', mat.unit) * ((mat.costPerUnit || 0) - before));
  }
  const drivers: MarginDriver[] = [...byMaterial]
    .filter(([, impact]) => Math.abs(impact) > 1e-9)
    .map(([materialId, costImpact]) => {
      const before = stamped[materialId];
      const now = materials.find(m => m.id === materialId)!.costPerUnit || 0;
      return { materialId, pctChange: before > 0 ? pct(now, before) : null, costImpact };
    })
    .sort((a, b) => Math.abs(b.costImpact) - Math.abs(a.costImpact));
  const priceImpact = drivers.reduce((s, d) => s + d.costImpact, 0);

  const pointsLost = marginAtPricing - marginNow;
  const target = targetFor(item, settings);
  const alertPoints = settings.marginAlertPoints ?? DEFAULT_ALERT_POINTS;
  const alert: MarginDrift['alert'] =
    target.explicit && costNow > 0 && marginNow < target.margin - 1e-9 ? 'below_target'
      : pointsLost >= alertPoints - 1e-9 && alertPoints > 0 ? 'slipped'
        : null;

  return { marginAtPricing, marginNow, pointsLost, costAtPricing, costNow, drivers, recipeChangeImpact: costNow - costAtPricing - priceImpact, alert };
}

/* ------------------------------------------------------------------------------------------------
 * The pricing stamp
 * ---------------------------------------------------------------------------------------------- */

export type PricingStamp = Required<Pick<MenuItem, 'pricedAt' | 'costAtPricing' | 'materialCostsAtPricing'>> & { pricingIsBaseline?: boolean };

/** What to write on a menu item when its price is set: the day, the unit cost and each recipe material's cost per unit right now. */
export function pricingStamp(item: Pick<MenuItem, 'recipe'>, materials: RawMaterial[], today: string): PricingStamp {
  const materialCostsAtPricing: Record<string, number> = {};
  for (const req of item.recipe) {
    const mat = materials.find(m => m.id === req.materialId);
    if (mat) materialCostsAtPricing[req.materialId] = mat.costPerUnit || 0;
  }
  return { pricedAt: today, costAtPricing: recipeCost(item.recipe, materials), materialCostsAtPricing };
}

/** Does this priced item still need a stamp? The baseline for items priced before stamping existed. */
export const needsBaselineStamp = (item: Pick<MenuItem, 'sellingPrice' | 'pricedAt' | 'costAtPricing'>): boolean =>
  item.sellingPrice > 0 && (!item.pricedAt || typeof item.costAtPricing !== 'number');

/* ------------------------------------------------------------------------------------------------
 * 3. Suggested price
 * ---------------------------------------------------------------------------------------------- */

export interface SuggestedPrice {
  /** Pre-GST price that earns exactly the target margin. */
  basePrice: number;
  /** What to type into the sale price: the base price, plus GST in inclusive pricing, rounded up. */
  menuPrice: number;
  /** The margin the rounded menu price actually earns (a little over the target, as it is rounded up). */
  marginAtMenuPrice: number;
}

/** Round up to a multiple of `step` (cents if there is no step), tolerant of floating-point dust. */
export function roundUpTo(value: number, step: number): number {
  if (!(value > 0)) return 0;
  const s = step > 0 ? step : 0.01;
  return round2(Math.ceil(value / s - 1e-9) * s);
}

/**
 * The price that earns a target margin on a unit cost: cost / (1 - target), grossed up for GST in inclusive
 * pricing, rounded up (never down, so the margin is never below the target).
 */
export function suggestedPriceForTarget(unitCost: number, targetMargin: number, settings: BakerySettings): SuggestedPrice {
  const target = Math.min(Math.max(targetMargin, 0), 99);
  const basePrice = unitCost > 0 ? unitCost / (1 - target / 100) : 0;
  const rate = settings.gstApplicable ? settings.gstRate || 0 : 0;
  const gross = settings.gstPricingMode === 'inclusive' && rate > 0 ? basePrice * (1 + rate / 100) : basePrice;
  const menuPrice = roundUpTo(gross, settings.priceRounding ?? DEFAULT_PRICE_ROUNDING);
  return { basePrice, menuPrice, marginAtMenuPrice: marginOf(menuPrice, unitCost, settings) };
}

/** The price to suggest for an item at its own target (or the default one). */
export function suggestedPriceFor(item: MenuItem, materials: RawMaterial[], settings: BakerySettings): SuggestedPrice & { target: number } {
  const target = targetFor(item, settings).margin;
  return { ...suggestedPriceForTarget(recipeCost(item.recipe, materials), target, settings), target };
}

export interface RepriceOption {
  /** The menu price to type in. */
  price: number;
  /** The margin % that price earns at today's cost. */
  margin: number;
}

/**
 * What an item with drifting margin could be repriced to: back to the margin it had when it was priced, and to its
 * target when the owner has set one it is below. An option is offered only if it is higher than the current
 * price: a drifting item is never told to cut its price.
 */
export function repriceOptions(item: MenuItem, drift: MarginDrift, settings: BakerySettings): { restore: RepriceOption | null; target: (RepriceOption & { targetMargin: number }) | null } {
  const higher = (s: SuggestedPrice): RepriceOption | null => (s.menuPrice > item.sellingPrice + 1e-9 ? { price: s.menuPrice, margin: s.marginAtMenuPrice } : null);
  const restore = drift.pointsLost > 1e-9 ? higher(suggestedPriceForTarget(drift.costNow, drift.marginAtPricing, settings)) : null;
  const target = targetFor(item, settings);
  const toTarget = target.explicit && drift.marginNow < target.margin - 1e-9 ? higher(suggestedPriceForTarget(drift.costNow, target.margin, settings)) : null;
  return { restore, target: toTarget ? { ...toTarget, targetMargin: target.margin } : null };
}

/* ------------------------------------------------------------------------------------------------
 * 4. What-if pricing
 * ---------------------------------------------------------------------------------------------- */

export interface ScenarioItem {
  menuItemId: string;
  /** Units sold in the days looked at (not scaled). */
  unitsInPeriod: number;
  /** Contribution over a 30-day month at today's prices and costs, and at the new price (and any volume guess). */
  contributionNow: number;
  contributionAfter: number;
  newPrice: number;
  noRecentSales: boolean;
}

export type BreakEven =
  /** Profit stays the same if sales fall by `pct` %. */
  | { type: 'can_lose'; pct: number }
  /** Sales must rise by `pct` % to make the same profit at the lower price. */
  | { type: 'must_gain'; pct: number }
  | { type: 'unchanged' }
  | { type: 'not_applicable' };

export interface PricingScenario {
  perItem: ScenarioItem[];
  /** Days of sales actually used: the lookback, or fewer if the business has fewer days of orders. */
  daysUsed: number;
  monthlyContributionNow: number;
  monthlyContributionAfter: number;
  breakEven: BreakEven;
}

/** New prices for items, each moved by a percentage and rounded to cents. Items with no price are left out. */
export function pricesFromPercent(menu: Pick<MenuItem, 'id' | 'sellingPrice'>[], itemIds: string[], percent: number): { menuItemId: string; newPrice: number }[] {
  const ids = new Set(itemIds);
  return menu
    .filter(m => ids.has(m.id) && m.sellingPrice > 0)
    .map(m => ({ menuItemId: m.id, newPrice: round2(m.sellingPrice * (1 + percent / 100)) }));
}

/**
 * What changing prices would do to monthly contribution, going by the units actually sold in the last 30 or 90
 * days. Both figures are forward-looking and use the same units, discounts and payment fees those items really
 * had: "now" is those units at today's menu price and today's costs, "after" is the same at the new price. (Not
 * the history as it was booked: a price or cost that moved since would make a "+8%" quietly include that move.)
 * Fixed costs do not move with price, so the change in contribution is the change in profit. Stockpot cannot know
 * how customers will react, so `expectedVolumeChangePct` is only the owner's own guess (default 0), and the
 * break-even says how far sales could move before profit is no better than today.
 */
export function pricingScenario(input: {
  changes: { menuItemId: string; newPrice: number }[];
  lookbackDays: 30 | 90;
  expectedVolumeChangePct?: number;
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: BakerySettings;
  today: string;
}): PricingScenario {
  const { changes, lookbackDays, orders, menu, materials, settings, today } = input;
  const volume = 1 + (input.expectedVolumeChangePct ?? 0) / 100;

  const actual = actualOrders(orders, today);
  const first = actual.reduce<string | null>((min, o) => (min === null || o.date < min ? o.date : min), null);
  const daysUsed = first === null ? lookbackDays : Math.max(1, Math.min(lookbackDays, daysBetween(first, today) + 1));
  const start = addDays(today, -(daysUsed - 1));
  const profits = productProfits(actual.filter(o => o.date >= start && o.date <= today), menu, materials, settings);
  const scale = 30 / daysUsed;

  let priceOnlyAfter = 0; // monthly contribution after the price change alone, whatever the volume guess
  let nowTotal = 0;
  const perItem: ScenarioItem[] = changes.map(({ menuItemId, newPrice }) => {
    const p = profits.get(menuItemId);
    if (!p || p.unitsSold <= 0) return { menuItemId, unitsInPeriod: 0, contributionNow: 0, contributionAfter: 0, newPrice, noRecentSales: true };
    const item = menu.find(m => m.id === menuItemId);
    if (!item) return { menuItemId, unitsInPeriod: 0, contributionNow: 0, contributionAfter: 0, newPrice, noRecentSales: true };
    const feeRate = p.revenue > 0 ? p.paymentFees / p.revenue : 0;
    const discountKept = p.grossRevenue > 0 ? p.revenue / p.grossRevenue : 1; // share of billed sales left after discounts
    // What does not move with the price: delivery charged less courier fees (the rest of the contribution is price- or cost-driven).
    const otherNet = p.contribution - p.revenue + p.costOfGoods + p.paymentFees;
    const costNow = p.unitsSold * recipeCost(item.recipe, materials);
    const at = (menuPrice: number) => p.unitsSold * basePriceOf(menuPrice, settings) * discountKept * (1 - feeRate) + otherNet - costNow;
    const now = at(item.sellingPrice);
    const after = at(newPrice);
    priceOnlyAfter += after * scale;
    nowTotal += now * scale;
    return {
      menuItemId, unitsInPeriod: p.unitsSold, newPrice, noRecentSales: false,
      contributionNow: now * scale,
      contributionAfter: after * scale * volume,
    };
  });

  // Break-even is for the price change alone, so it ignores the owner's volume guess.
  let breakEven: BreakEven = { type: 'not_applicable' };
  if (nowTotal > 0 && priceOnlyAfter > 0) {
    if (Math.abs(priceOnlyAfter - nowTotal) < 1e-9) breakEven = { type: 'unchanged' };
    else if (priceOnlyAfter > nowTotal) breakEven = { type: 'can_lose', pct: (1 - nowTotal / priceOnlyAfter) * 100 };
    else breakEven = { type: 'must_gain', pct: (nowTotal / priceOnlyAfter - 1) * 100 };
  }

  return {
    perItem, daysUsed,
    monthlyContributionNow: nowTotal,
    monthlyContributionAfter: perItem.reduce((s, i) => s + i.contributionAfter, 0),
    breakEven,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Across the menu
 * ---------------------------------------------------------------------------------------------- */

/** Items whose margin has slipped or is below target, with the drift that says why. Largest margin loss first. */
export function itemsNeedingRepricing(menu: MenuItem[], materials: RawMaterial[], settings: BakerySettings): { item: MenuItem; drift: MarginDrift }[] {
  const out: { item: MenuItem; drift: MarginDrift }[] = [];
  for (const item of menu) {
    const drift = marginDrift(item, materials, settings);
    if (drift?.alert) out.push({ item, drift });
  }
  return out.sort((a, b) => b.drift.pointsLost - a.drift.pointsLost);
}
