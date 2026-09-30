import { describe, it, expect } from 'vitest';
import { summarizeWastage, reasonOf, UNSPECIFIED_REASON } from '../wastageStats';
import { experimentCost, summarizeExperiments } from '../rndStats';
import { recipeCost, getMarginInfo, suggestedPrice, summarizeMenu } from '../menuStats';

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 10 },
  { id: 'egg', name: 'Egg', unit: 'pcs', costPerUnit: 5 },
];

describe('summarizeWastage', () => {
  const logs: any[] = [
    { id: '1', type: 'material', cost: 60, reason: 'Expired' },
    { id: '2', type: 'recipe', cost: 30, reason: ' Expired ' },
    { id: '3', type: 'recipe', cost: 10, reason: '' },
  ];

  it('totals loss and splits by type', () => {
    const s = summarizeWastage(logs, []);
    expect(s.totalLoss).toBe(100);
    expect(s.count).toBe(3);
    expect(s.materialCount).toBe(1);
    expect(s.recipeCount).toBe(2);
  });

  it('groups by trimmed reason, biggest cost first', () => {
    const { byReason } = summarizeWastage(logs, []);
    expect(byReason.map(r => [r.reason, r.cost, r.count])).toEqual([['Expired', 90, 2], [UNSPECIFIED_REASON, 10, 1]]);
    expect(byReason[0].percent).toBe(90);
  });

  it('compares loss to production spend only when there is any', () => {
    expect(summarizeWastage(logs, []).lossVsProductionPercent).toBeNull();
    expect(summarizeWastage(logs, [{ costTotal: 1000 } as any]).lossVsProductionPercent).toBe(10);
  });

  it('handles no logs', () => {
    expect(summarizeWastage([], [])).toMatchObject({ totalLoss: 0, count: 0, byReason: [] });
    expect(reasonOf({ reason: '  ' })).toBe(UNSPECIFIED_REASON);
  });
});

describe('R&D stats', () => {
  const exps: any[] = [
    { id: 'a', date: '2026-03-05', materials: [{ materialId: 'flour', amount: 500, unit: 'g' }, { materialId: 'egg', amount: 2, unit: 'pcs' }] },
    { id: 'b', date: '2026-02-20', materials: [{ materialId: 'flour', amount: 1, unit: 'kg' }, { materialId: 'gone', amount: 9, unit: 'g' }] },
  ];

  it('costs an experiment with unit conversion, skipping unknown materials', () => {
    expect(experimentCost(exps[0], materials)).toBe(15); // 0.5kg*10 + 2*5
    expect(experimentCost(exps[1], materials)).toBe(10);
  });

  it('summarises totals, this month and distinct materials', () => {
    const s = summarizeExperiments(exps, materials, '2026-03-10');
    expect(s).toMatchObject({ sessions: 2, totalCost: 25, monthCost: 15, monthSessions: 1, avgCost: 12.5, distinctMaterials: 3 });
  });
});

describe('menu stats', () => {
  it('costs a recipe and computes margins', () => {
    expect(recipeCost([{ materialId: 'flour', amount: 250, unit: 'g' }], materials)).toBe(2.5);
    expect(getMarginInfo(10, 2.5)).toEqual({ margin: 75, tier: 'high', isLoss: false });
    expect(getMarginInfo(10, 5).tier).toBe('mid');
    expect(getMarginInfo(10, 7).tier).toBe('low');
    expect(getMarginInfo(10, 12).isLoss).toBe(true);
    expect(getMarginInfo(0, 3).margin).toBe(0);
    expect(suggestedPrice(2.5)).toBe(8.75);
  });

  it('summarises the menu', () => {
    const menu: any[] = [
      { id: 'a', name: 'A', sellingPrice: 10, recipe: [{ materialId: 'flour', amount: 250, unit: 'g' }] }, // 25% food cost, 75% margin
      { id: 'b', name: 'B', sellingPrice: 10, recipe: [{ materialId: 'flour', amount: 700, unit: 'g' }] }, // 70% food cost, 30% margin
      { id: 'c', name: 'C', sellingPrice: 0, recipe: [] },
    ];
    const s = summarizeMenu(menu, materials);
    expect(s.itemCount).toBe(3);
    expect(s.avgFoodCostPercent).toBe(47.5);
    expect(s.best?.item.id).toBe('a');
    expect(s.needsReview.map(i => i.id)).toEqual(['b', 'c']);
  });

  it('has no average or best for an empty menu', () => {
    expect(summarizeMenu([], materials)).toEqual({ itemCount: 0, avgFoodCostPercent: null, best: null, needsReview: [] });
  });
});
