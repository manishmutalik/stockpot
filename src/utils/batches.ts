/**
 * batches.ts
 *
 * Production in batches, and what actually came out. An item can say how many one batch makes (`batchMakes`: 4.5 sponge
 * bases, 24 cookies, 2 kg of paneer); its recipe stays per one item, so a batch is simply `batchMakes` of it. A run then
 * records what its ingredients were for (`quantityProduced`) and what came out (`quantityYield`), which may be less (burnt,
 * broken, a poor batch of paneer) or more (a batch that went further).
 *
 * Sold items carry the planned cost per piece, so margins stay steady; the difference between planned and actual is its own
 * cost, "lost in production" (`runYieldLoss`, negative for a gain), valued at the run's planned cost per piece and taken off
 * profit in the period of the run (utils/profit). Together they add up to what was spent.
 */
import type { ItemPart, MenuItem, ProductionRun } from '../types';

/** A run's figures as the sums need them (a cost may be missing on a run read from elsewhere: it then counts as nothing). */
export type RunFigures = Pick<ProductionRun, 'quantityProduced'> & Partial<Pick<ProductionRun, 'quantityYield' | 'costTotal'>>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Pieces a number of batches should make. */
export const expectedUnits = (batches: number, batchMakes: number): number => round6(batches * batchMakes);

/** What a run came out short of (positive) or over (negative), at its planned cost per piece. Nothing for a run as planned. */
export function runYieldLoss(run: RunFigures): number {
  const planned = run.quantityProduced;
  const actual = run.quantityYield ?? planned;
  if (!(planned > 0) || actual === planned) return 0;
  return round2(((planned - actual) * (run.costTotal || 0)) / planned);
}

/** Lost (or, below nothing, gained) in production by the runs dated `start`..`end`. */
export function productionLossForRange(runs: (RunFigures & Pick<ProductionRun, 'date'>)[], start: string, end: string): number {
  return round2(runs.filter(r => r.date >= start && r.date <= end).reduce((s, r) => s + runYieldLoss(r), 0));
}

/** What one piece from this run really cost: its cost over what came out. Null when nothing came out. */
export const actualCostPerUnit = (run: RunFigures): number | null => {
  const actual = run.quantityYield ?? run.quantityProduced;
  return actual > 0 ? round2((run.costTotal || 0) / actual) : null;
};

/** What came out of a run may be at most this many times what its ingredients were for (a typo, not a good batch, beyond it). */
export const MAX_YIELD_OVER = 3;

export const BATCH_HISTORY = 5;

export interface BatchYield {
  /** Runs counted (the most recent logged in batches, up to BATCH_HISTORY). */
  runs: number;
  /** Pieces one batch actually gave, on average. */
  averagePerBatch: number;
  /** What the item says a batch makes. */
  expected: number;
}

/** How the item's recent batches actually came out, against its batch size. Null with no batch size or no runs in batches. */
export function batchYield(item: Pick<MenuItem, 'id' | 'batchMakes'>, runs: Pick<ProductionRun, 'recipeId' | 'batches' | 'quantityProduced' | 'quantityYield' | 'date' | 'createdAt'>[]): BatchYield | null {
  if (!(item.batchMakes && item.batchMakes > 0)) return null;
  const recent = runs
    .filter(r => r.recipeId === item.id && r.batches && r.batches > 0)
    .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.createdAt ?? 0) - (a.createdAt ?? 0)))
    .slice(0, BATCH_HISTORY);
  if (recent.length === 0) return null;
  const batches = recent.reduce((s, r) => s + (r.batches || 0), 0);
  const made = recent.reduce((s, r) => s + (r.quantityYield ?? r.quantityProduced), 0);
  return { runs: recent.length, averagePerBatch: round2(made / batches), expected: item.batchMakes };
}

/**
 * A new batch size, keeping what one batch uses: the per-piece recipe (and parts) scale by old ÷ new. A batch that turns out
 * to make 4.2 bases, not 4.5, still uses the same cake gel, so each base now carries a little more of it.
 */
export function rescaleForBatchSize(item: Pick<MenuItem, 'recipe' | 'parts' | 'batchMakes'>, newMakes: number): { batchMakes: number; recipe: MenuItem['recipe']; parts?: ItemPart[] } {
  const old = item.batchMakes && item.batchMakes > 0 ? item.batchMakes : newMakes;
  const f = old / newMakes;
  return {
    batchMakes: newMakes,
    recipe: (item.recipe ?? []).map(r => ({ ...r, amount: round6(r.amount * f) })),
    ...(item.parts && { parts: item.parts.map(p => ({ ...p, quantity: round6(p.quantity * f) })) }),
  };
}
