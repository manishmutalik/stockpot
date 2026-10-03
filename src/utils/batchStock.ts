import type { MenuItem } from '../types';
import type { ProductionRun } from '../components/ProductionRunModal';

/**
 * What is really left of each production batch.
 *
 * `MenuItem.finishedGoodsStock` is the authoritative count of units on the
 * shelf: production adds to it, and orders, discards and wastage take from it.
 * A batch's stored `remainingQuantity` is only updated when the batch itself is
 * discarded, so on its own it never shrinks when an order uses the stock, and
 * the Production tab, the freshness alerts and Market Stock kept showing units
 * that had already been sold.
 *
 * So the shelf count is spread over the batches, newest first (the oldest units
 * are the ones sold or used first). A batch never shows more than its stored
 * remaining, and a discarded batch (stored 0) stays empty. Orders that are
 * edited or deleted give stock back to the shelf count, and the batches follow,
 * so nothing here needs to be written back.
 */
export function withShelfStock(runs: ProductionRun[], menu: Pick<MenuItem, 'id' | 'finishedGoodsStock'>[]): ProductionRun[] {
  const onShelf = new Map(menu.map(m => [m.id, Math.max(0, m.finishedGoodsStock ?? 0)]));
  const newestFirst = [...runs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const left = new Map<string, number>();
  for (const run of newestFirst) {
    const stored = Math.max(0, run.remainingQuantity ?? 0);
    const available = onShelf.get(run.recipeId) ?? 0;
    const remaining = Math.min(stored, available);
    onShelf.set(run.recipeId, available - remaining);
    left.set(run.id, remaining);
  }
  return runs.map(run => {
    const remaining = left.get(run.id) ?? 0;
    return remaining === (run.remainingQuantity ?? 0) ? run : { ...run, remainingQuantity: remaining };
  });
}
