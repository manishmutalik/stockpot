import { describe, it, expect } from 'vitest';
import { summarizeProduction, getYieldInfo, getOldestBatchDate, getRunStatus } from '../productionStats';

const run = (id: string, over: Record<string, any> = {}): any => ({
  id, recipeId: 'cake', quantityProduced: 10, date: '2026-03-10', costTotal: 50, createdAt: 0, ...over,
});

describe('summarizeProduction', () => {
  it('totals units, cost, yield and this-week runs', () => {
    const s = summarizeProduction([
      run('a', { quantityProduced: 10, quantityYield: 9, costTotal: 50, date: '2026-03-10' }),
      run('b', { quantityProduced: 10, costTotal: 30, date: '2026-03-04' }), // 6 days ago: in the week
      run('c', { quantityProduced: 20, costTotal: 20, date: '2026-03-03' }), // 7 days ago: out
    ], '2026-03-10');
    expect(s.totalRuns).toBe(3);
    expect(s.runsThisWeek).toBe(2);
    expect(s.unitsProduced).toBe(40);
    expect(s.unitsSellable).toBe(39);
    expect(s.yieldPercent).toBeCloseTo(97.5);
    expect(s.totalCost).toBe(100);
    expect(s.costPerUnit).toBe(2.5);
  });

  it('is safe with no runs', () => {
    expect(summarizeProduction([], '2026-03-10')).toMatchObject({ totalRuns: 0, yieldPercent: 100, costPerUnit: 0 });
  });
});

describe('getYieldInfo', () => {
  it('reports waste and percent, defaulting sellable to produced', () => {
    expect(getYieldInfo(run('a', { quantityYield: 8 }))).toEqual({ percent: 80, waste: 2 });
    expect(getYieldInfo(run('b'))).toEqual({ percent: 100, waste: 0 });
  });
});

describe('getOldestBatchDate', () => {
  it('ignores sold-out batches and other recipes', () => {
    const runs = [
      run('a', { date: '2026-03-01', remainingQuantity: 0 }),
      run('b', { date: '2026-03-05', remainingQuantity: 2 }),
      run('c', { date: '2026-03-08', remainingQuantity: 4 }),
      run('d', { date: '2026-02-01', remainingQuantity: 4, recipeId: 'other' }),
    ];
    expect(getOldestBatchDate('cake', runs)).toBe('2026-03-05');
    expect(getOldestBatchDate('none', runs)).toBeNull();
  });
});

describe('getRunStatus', () => {
  it('reflects what is left and how fresh it is', () => {
    expect(getRunStatus(run('a', { remainingQuantity: 0 }), '2026-03-10').label).toBe('Sold out');
    expect(getRunStatus(run('a', { remainingQuantity: 3 }), '2026-03-10').label).toBe('In stock · 3 left');
    expect(getRunStatus(run('a', { remainingQuantity: 3, expiryDate: '2026-03-09' }), '2026-03-10').label).toBe('Expired · 3 left');
    expect(getRunStatus(run('a', { remainingQuantity: 3, date: '2026-03-07' }), '2026-03-10').label).toBe('Check freshness · 3 left');
  });
});
