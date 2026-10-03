import { describe, it, expect } from 'vitest';
import { withShelfStock } from '../batchStock';
import type { ProductionRun } from '../../components/ProductionRunModal';

const run = (id: string, date: string, remainingQuantity: number, over: Partial<ProductionRun> = {}): ProductionRun => ({
  id, recipeId: 'cake', quantityProduced: 10, remainingQuantity, date, costTotal: 100, createdAt: 1, ...over,
});
const remaining = (runs: ProductionRun[]) => Object.fromEntries(runs.map(r => [r.id, r.remainingQuantity]));

describe('withShelfStock', () => {
  it('leaves batches alone while the shelf still holds all of them', () => {
    const runs = [run('a', '2026-10-01', 10), run('b', '2026-10-02', 10)];
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 20 }]))).toEqual({ a: 10, b: 10 });
  });

  it('takes sold units from the oldest batch first', () => {
    const runs = [run('a', '2026-10-01', 10), run('b', '2026-10-02', 10)];
    // 12 of 20 units sold: the old batch is gone and 2 of the newer one went too.
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 8 }]))).toEqual({ a: 0, b: 8 });
  });

  it('shows nothing left when an order used all the stock', () => {
    const runs = [run('a', '2026-10-01', 10)];
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 0 }]))).toEqual({ a: 0 });
    expect(remaining(withShelfStock(runs, [{ id: 'cake' }]))).toEqual({ a: 0 });
  });

  it('gives units back when an order is edited or deleted', () => {
    const runs = [run('a', '2026-10-01', 10)];
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 3 }]))).toEqual({ a: 3 });
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 10 }]))).toEqual({ a: 10 });
  });

  it('keeps a discarded batch empty and never shows more than the batch holds', () => {
    const runs = [run('old', '2026-09-28', 0), run('new', '2026-10-02', 4)];
    expect(remaining(withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 50 }]))).toEqual({ old: 0, new: 4 });
  });

  it('keeps recipes apart and breaks ties on the same day by when the batch was logged', () => {
    const runs = [
      run('x', '2026-10-02', 5, { createdAt: 1 }),
      run('y', '2026-10-02', 5, { createdAt: 2 }),
      run('p', '2026-10-02', 5, { recipeId: 'pie' }),
    ];
    const out = withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 5 }, { id: 'pie', finishedGoodsStock: 0 }]);
    expect(remaining(out)).toEqual({ x: 0, y: 5, p: 0 });
  });

  it('does not change the stored runs', () => {
    const runs = [run('a', '2026-10-01', 10)];
    withShelfStock(runs, [{ id: 'cake', finishedGoodsStock: 0 }]);
    expect(runs[0].remainingQuantity).toBe(10);
  });
});
