import type { ProductionRun } from '../components/ProductionRunModal';
import { daysBetween, getStockUrgency } from './stockAging';

export interface ProductionSummary {
  totalRuns: number;
  /** Runs dated within the last 7 days (today included). */
  runsThisWeek: number;
  unitsProduced: number;
  /** Units left to sell after waste at the bench (quantityYield, else produced). */
  unitsSellable: number;
  /** Sellable as a share of produced, 0-100 (100 when nothing was produced). */
  yieldPercent: number;
  totalCost: number;
  /** Material cost per produced unit. */
  costPerUnit: number;
}

export const sellableOf = (run: ProductionRun) => run.quantityYield ?? run.quantityProduced;

export function summarizeProduction(runs: ProductionRun[], today: string): ProductionSummary {
  let unitsProduced = 0;
  let unitsSellable = 0;
  let totalCost = 0;
  let runsThisWeek = 0;
  for (const r of runs) {
    unitsProduced += r.quantityProduced || 0;
    unitsSellable += sellableOf(r) || 0;
    totalCost += r.costTotal || 0;
    const age = daysBetween(r.date, today);
    if (age >= 0 && age <= 6) runsThisWeek += 1;
  }
  return {
    totalRuns: runs.length,
    runsThisWeek,
    unitsProduced,
    unitsSellable,
    yieldPercent: unitsProduced > 0 ? (unitsSellable / unitsProduced) * 100 : 100,
    totalCost,
    costPerUnit: unitsProduced > 0 ? totalCost / unitsProduced : 0,
  };
}

/** One run's yield: how much of what was produced was sellable. */
export function getYieldInfo(run: ProductionRun): { percent: number; waste: number } {
  const waste = Math.max(0, (run.quantityProduced || 0) - (sellableOf(run) || 0));
  const percent = run.quantityProduced > 0 ? (sellableOf(run) / run.quantityProduced) * 100 : 100;
  return { percent, waste };
}

/** Date of the oldest batch of a recipe that still has unsold units, if any. */
export function getOldestBatchDate(recipeId: string, runs: ProductionRun[]): string | null {
  let oldest: string | null = null;
  for (const r of runs) {
    if (r.recipeId !== recipeId || (r.remainingQuantity ?? 0) <= 0) continue;
    if (oldest === null || r.date < oldest) oldest = r.date;
  }
  return oldest;
}

/** Status pill for one production run: what's left of it and how fresh. */
export function getRunStatus(run: ProductionRun, today: string): { label: string; cls: string } {
  const remaining = run.remainingQuantity ?? 0;
  if (remaining <= 0) return { label: 'Sold out', cls: 'bg-stone-100 text-muted' };
  const urgency = getStockUrgency(run, today);
  if (urgency === 'expired') return { label: `Expired · ${remaining} left`, cls: 'bg-coral/10 text-coral' };
  if (urgency === 'aging') return { label: `Check freshness · ${remaining} left`, cls: 'bg-amber-100 text-amber-700' };
  return { label: `In stock · ${remaining} left`, cls: 'bg-margin/10 text-margin' };
}
