/**
 * reorder.ts
 *
 * Which materials will run out before the low-stock alert would warn, and how
 * much to order. A pure calculation from the business's own records: no model is
 * involved. The rules are documented in docs/AI_CFO_DESIGN.md ("Reorder-point
 * suggestions"); every constant is a named export so a test pins it and a change
 * is a one-line edit.
 *
 * Usage is rebuilt from production runs (the quantity made times the recipe's
 * amount of the material, in the material's unit) plus discards of the material.
 * Runs do not record what they consumed, so the recipe as it is now is used for
 * history. R&D experiments and restocks are not counted.
 *
 * It never guesses: a material with fewer than MIN_HISTORY_DAYS of history is
 * reported as "not enough history yet", and one with no use in the window is
 * never flagged.
 */
import type { MenuItem, RawMaterial, WastageLog } from '../types';
import { convertAmount } from './conversions';
import { addDays, daysBetween } from './localDate';

/** Days of use the rate is averaged over. */
export const USAGE_WINDOW_DAYS = 28;
/** The most recent days also checked, so a busy week is not averaged away. */
export const RECENT_DAYS = 7;
/** Days of history a material needs before anything is suggested for it. */
export const MIN_HISTORY_DAYS = 7;
/** Below this much history a suggestion is marked low confidence. */
export const LOW_CONFIDENCE_HISTORY_DAYS = 14;
/** Days from ordering to having it, unless the material says otherwise. */
export const DEFAULT_LEAD_TIME_DAYS = 2;
/** Extra days of cover kept on top of the lead time. */
export const DEFAULT_SAFETY_DAYS = 2;
/** How many days of use an order should cover beyond lead time and safety. */
export const REVIEW_DAYS = 7;
/** Daily use that varies more than this (standard deviation over the mean) is low confidence. */
export const HIGH_VARIATION = 1;

export type ReorderFlag = 'before_threshold' | 'at_threshold';
export type ReorderConfidence = 'normal' | 'low';

export interface ReorderSuggestion {
  materialId: string;
  name: string;
  unit: string;
  /** What is on hand now, in `unit`. */
  stock: number;
  /** Use per day, in `unit`: the larger of the 28-day and the 7-day rate. */
  rate: number;
  /** Days the stock lasts at `rate` (0 when none is left). */
  daysOfCover: number;
  /** The day it runs out at that rate (YYYY-MM-DD). */
  runOutDate: string;
  /** How much to order, in `unit`, rounded up to two significant figures. */
  suggestedQty: number;
  /** `at_threshold` when the low-stock alert already covers it. */
  flag: ReorderFlag;
  confidence: ReorderConfidence;
  /** Days of history the rate is based on. */
  historyDays: number;
}

export interface ReorderResult {
  /** Flagged materials, soonest to run out first. */
  suggestions: ReorderSuggestion[];
  /** Materials that are used but have too little history to say anything about. */
  notEnoughHistory: string[];
}

/** Rounds up to `digits` significant figures: 2.34 to 2.4, 1234 to 1300. */
export function roundUpSignificant(value: number, digits = 2): number {
  if (!(value > 0)) return 0;
  const magnitude = Math.floor(Math.log10(value));
  const step = 10 ** (magnitude - digits + 1);
  // Strip floating-point noise before rounding up, so 2.4 does not become 2.5.
  return Number((Math.ceil(Number((value / step).toFixed(9))) * step).toPrecision(12));
}

type RunLike = { recipeId: string; quantityProduced: number; date: string };
type MaterialLike = Pick<RawMaterial, 'id' | 'name' | 'unit' | 'threshold' | 'dateAdded'> & { remaining: number; leadTimeDays?: number };
type MenuLike = Pick<MenuItem, 'id' | 'recipe'>;

export function reorderSuggestions(input: {
  /** With their live remaining stock, as the Inventory tab shows it. */
  materials: MaterialLike[];
  menu: MenuLike[];
  productionRuns: RunLike[];
  wastageLogs: Pick<WastageLog, 'type' | 'itemId' | 'quantity' | 'date'>[];
  /** Today in the business's time zone. */
  today: string;
}): ReorderResult {
  const { materials, menu, productionRuns, wastageLogs, today } = input;
  const byId = new Map(materials.map(m => [m.id, m]));
  const recipes = new Map(menu.map(m => [m.id, m.recipe ?? []]));

  // What was used of each material on each day, and the first day it was used.
  const used = new Map<string, Map<string, number>>();
  const firstUse = new Map<string, string>();
  const record = (materialId: string, date: string, amount: number) => {
    if (!(amount > 0) || !date || date > today) return;
    const days = used.get(materialId) ?? new Map<string, number>();
    days.set(date, (days.get(date) ?? 0) + amount);
    used.set(materialId, days);
    const first = firstUse.get(materialId);
    if (!first || date < first) firstUse.set(materialId, date);
  };
  for (const run of productionRuns) {
    for (const req of recipes.get(run.recipeId) ?? []) {
      const material = byId.get(req.materialId);
      if (!material) continue;
      record(material.id, run.date, convertAmount(req.amount, req.unit || 'g', material.unit) * (run.quantityProduced || 0));
    }
  }
  for (const log of wastageLogs) {
    if (log.type === 'material' && byId.has(log.itemId)) record(log.itemId, log.date, log.quantity);
  }

  const suggestions: ReorderSuggestion[] = [];
  const notEnoughHistory: string[] = [];

  for (const material of materials) {
    const days = used.get(material.id);
    if (!days) continue; // never used: never flagged

    const starts = [material.dateAdded, firstUse.get(material.id)].filter((d): d is string => !!d && d <= today);
    const historyStart = starts.sort()[0];
    const historyDays = historyStart ? daysBetween(historyStart, today) : 0;
    if (historyDays < MIN_HISTORY_DAYS) { notEnoughHistory.push(material.id); continue; }

    const windowDays = Math.min(USAGE_WINDOW_DAYS, historyDays);
    const windowStart = addDays(today, -(windowDays - 1));
    const recentStart = addDays(today, -(RECENT_DAYS - 1));
    const daily: number[] = Array.from({ length: windowDays }, (_, i) => days.get(addDays(windowStart, i)) ?? 0);
    const total = daily.reduce((a, b) => a + b, 0);
    const recent = [...days].filter(([d]) => d >= recentStart).reduce((sum, [, amount]) => sum + amount, 0);
    const rate = Math.max(total / windowDays, recent / RECENT_DAYS);
    if (!(rate > 0)) continue; // no use in the window

    const stock = Math.max(material.remaining, 0);
    const daysOfCover = stock / rate;
    const lead = material.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
    const margin = lead + DEFAULT_SAFETY_DAYS;
    if (daysOfCover > margin) continue;

    const mean = total / windowDays;
    const deviation = Math.sqrt(daily.reduce((sum, v) => sum + (v - mean) ** 2, 0) / windowDays);
    const threshold = material.threshold ?? 0;

    suggestions.push({
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      stock,
      rate,
      daysOfCover,
      runOutDate: addDays(today, Math.floor(daysOfCover)),
      suggestedQty: roundUpSignificant(Math.max(rate * (REVIEW_DAYS + margin) - stock, 0)),
      flag: threshold > 0 && material.remaining <= threshold ? 'at_threshold' : 'before_threshold',
      confidence: historyDays < LOW_CONFIDENCE_HISTORY_DAYS || deviation / mean > HIGH_VARIATION ? 'low' : 'normal',
      historyDays,
    });
  }

  suggestions.sort((a, b) => a.daysOfCover - b.daysOfCover || a.name.localeCompare(b.name));
  return { suggestions, notEnoughHistory };
}
