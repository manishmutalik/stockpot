import { describe, it, expect } from 'vitest';
import type { ProductionRun } from '../../types';
import { actualCostPerUnit, batchYield, BATCH_HISTORY, expectedUnits, productionLossForRange, rescaleForBatchSize, runYieldLoss } from '../batches';

const run = (over: Record<string, unknown> = {}) => ({ recipeId: 'base', date: '2026-10-10', createdAt: 0, quantityProduced: 9, costTotal: 648, ...over }) as unknown as ProductionRun;

describe('batches', () => {
  it('works out the pieces a number of batches makes', () => {
    expect(expectedUnits(2, 4.5)).toBe(9);
    expect(expectedUnits(1.5, 24)).toBe(36);
    expect(expectedUnits(3, 0.333333)).toBe(0.999999);
  });

  it('values what a run came out short of at its planned cost per piece, and a gain below nothing', () => {
    // ₹648 for 9 bases: ₹72 each.
    expect(runYieldLoss(run({ quantityYield: 8 }))).toBe(72);
    expect(runYieldLoss(run({ quantityYield: 10 }))).toBe(-72);
    expect(runYieldLoss(run({ quantityYield: 9 }))).toBe(0);
    expect(runYieldLoss(run())).toBe(0);
    expect(runYieldLoss(run({ quantityYield: 0 }))).toBe(648);
    expect(runYieldLoss(run({ quantityProduced: 0, quantityYield: 0 }))).toBe(0);
    // A run read from elsewhere without a cost loses nothing.
    expect(runYieldLoss({ quantityProduced: 9, quantityYield: 8 })).toBe(0);
  });

  it('adds up the loss of the runs in a range only', () => {
    const runs = [run({ quantityYield: 8 }), run({ date: '2026-10-11', quantityYield: 10 }), run({ date: '2026-10-12', quantityYield: 7 }), run({ date: '2026-09-01', quantityYield: 1 })];
    expect(productionLossForRange(runs, '2026-10-10', '2026-10-12')).toBe(144);
    expect(productionLossForRange(runs, '2026-10-11', '2026-10-11')).toBe(-72);
  });

  it('says what a piece really cost: the run\'s cost over what came out', () => {
    expect(actualCostPerUnit(run({ quantityYield: 8 }))).toBe(81);
    expect(actualCostPerUnit(run())).toBe(72);
    expect(actualCostPerUnit(run({ quantityYield: 0 }))).toBeNull();
  });

  it('averages the recent runs logged in batches, latest first, against the size set', () => {
    const item = { id: 'base', batchMakes: 4.5 };
    const runs = [
      run({ batches: 2, quantityYield: 8, date: '2026-10-10' }),
      run({ batches: 1, quantityProduced: 4.5, quantityYield: 4, date: '2026-10-12' }),
      run({ date: '2026-10-13', quantityYield: 1 }), // not in batches
      run({ recipeId: 'other', batches: 5, quantityYield: 1 }),
    ];
    expect(batchYield(item, runs)).toEqual({ runs: 2, averagePerBatch: 4, expected: 4.5 });
    // As planned when nothing else was entered.
    expect(batchYield(item, [run({ batches: 2 })])).toEqual({ runs: 1, averagePerBatch: 4.5, expected: 4.5 });
  });

  it('counts only the last few runs', () => {
    const old = Array.from({ length: BATCH_HISTORY }, (_, i) => run({ batches: 1, quantityProduced: 4.5, quantityYield: 4, date: `2026-10-0${i + 1}` }));
    const runs = [...old, run({ batches: 1, quantityProduced: 4.5, quantityYield: 9, date: '2026-09-01' })];
    expect(batchYield({ id: 'base', batchMakes: 4.5 }, runs)!.averagePerBatch).toBe(4);
  });

  it('has nothing to say without a batch size or runs in batches', () => {
    expect(batchYield({ id: 'base' }, [run({ batches: 2 })])).toBeNull();
    expect(batchYield({ id: 'base', batchMakes: 4.5 }, [run()])).toBeNull();
  });

  it('rescales the per-piece recipe and parts so one batch keeps the same ingredients', () => {
    const item = { batchMakes: 4.5, recipe: [{ materialId: 'gel', amount: 220, unit: 'g' }], parts: [{ itemId: 'filling', quantity: 1 }] };
    const r = rescaleForBatchSize(item, 4);
    expect(r.batchMakes).toBe(4);
    // 990 g of gel for a batch, now over 4.
    expect(r.recipe[0].amount).toBe(247.5);
    expect(r.parts![0].quantity).toBe(1.125);
    expect(rescaleForBatchSize({ recipe: [] }, 4)).toEqual({ batchMakes: 4, recipe: [] });
    // A recipe written for the whole batch, divided over it.
    expect(rescaleForBatchSize({ ...item, batchMakes: 1 }, 4.5).recipe[0].amount).toBeCloseTo(48.888889, 5);
  });
});
