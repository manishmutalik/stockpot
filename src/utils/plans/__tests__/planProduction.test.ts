import { describe, it, expect } from 'vitest';
import { planProductionRun, planProductionSession, type Working } from '../planProduction';
import type { MenuItem, RawMaterial } from '../../../types';

const flour: RawMaterial = { id: 'flour', name: 'Flour', unit: 'g', initialStock: 1000, costPerUnit: 0.05, category: 'Raw Materials', threshold: 100, dateAdded: '2026-01-01' };
const butter: RawMaterial = { id: 'butter', name: 'Butter', unit: 'g', initialStock: 2000, costPerUnit: 0.5, category: 'Raw Materials', threshold: 100, dateAdded: '2026-01-01' };
const croissant = { id: 'croissant', name: 'Croissant', sellingPrice: 100, finishedGoodsStock: 0, shelfLifeDays: 2, recipe: [{ materialId: 'flour', amount: 100, unit: 'g' }, { materialId: 'butter', amount: 50, unit: 'g' }] } as MenuItem;
const sourdough = { id: 'sourdough', name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 3, recipe: [{ materialId: 'flour', amount: 50, unit: 'g' }] } as MenuItem;
const state = (): Working => ({ materials: [flour, butter], menu: [croissant, sourdough] });
const ids = () => { let n = 0; return { newId: () => `id${n++}`, now: () => 1_760_000_000_000 }; };
const row = (recipeId: string, quantityProduced: number, extra: object = {}) => ({ recipeId, quantityProduced, date: '2026-10-06', costTotal: 0, ...extra });

describe('planProductionRun', () => {
  it('deducts the ingredients, adds the yield to finished stock and records the run, in that order', () => {
    const plan = planProductionRun(row('croissant', 24) as any, state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.writes.map(w => `${w.collection}/${w.id}`)).toEqual(['materials/flour', 'materials/butter', 'menu/croissant', 'productionRuns/id0']);
    expect(plan.writes[0].data).toEqual({ initialStock: 1000 - 2400 }); // the web lets stock go negative
    expect(plan.writes[1].data).toEqual({ initialStock: 2000 - 1200 });
    expect(plan.writes[2].data).toEqual({ finishedGoodsStock: 24 });
    expect(plan.writes[3]).toMatchObject({ merge: false });
    expect(plan.writes[3].data).toMatchObject({
      id: 'id0', recipeId: 'croissant', quantityProduced: 24, remainingQuantity: 24, date: '2026-10-06', expiryDate: '2026-10-08', createdAt: 1_760_000_000_000,
    });
  });

  it('adds the yield, not the quantity, when they differ (waste)', () => {
    const plan = planProductionRun(row('croissant', 24, { quantityYield: 21 }) as any, state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.writes.find(w => w.collection === 'menu')!.data).toEqual({ finishedGoodsStock: 21 });
    expect(plan.writes.find(w => w.collection === 'productionRuns')!.data).toMatchObject({ quantityYield: 21, remainingQuantity: 21 });
  });

  it('gives the stock afterwards, for the next step to start from, without changing what it was given', () => {
    const start = state();
    const plan = planProductionRun(row('croissant', 2) as any, start, ids());
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.state.materials.find(m => m.id === 'flour')!.initialStock).toBe(800);
    expect(plan.state.menu.find(m => m.id === 'croissant')!.finishedGoodsStock).toBe(2);
    expect(start.materials[0].initialStock).toBe(1000);
  });

  it('refuses a recipe that is not on the menu', () => {
    const plan = planProductionRun(row('nope', 1) as any, state(), ids());
    expect(plan.ok).toBe(false);
    if (plan.ok === false) expect(plan.error).toMatchObject({ code: 'unknown_recipe', message: 'Selected recipe could not be found. Please reselect it and try again.' });
  });
});

describe('planProductionSession', () => {
  it('a bake of two items that share flour takes off both amounts, each document written once (the "24 croissants and 2 sourdough" case)', () => {
    const plan = planProductionSession([row('croissant', 24) as any, row('sourdough', 2) as any], { materials: [{ ...flour, initialStock: 5000 }, butter], menu: [croissant, sourdough] }, ids());
    if (plan.ok === false) throw new Error('expected ok');
    const flourWrites = plan.writes.filter(w => w.id === 'flour');
    expect(flourWrites).toHaveLength(1);
    expect(flourWrites[0].data).toEqual({ initialStock: 5000 - 2400 - 100 });
    expect(plan.writes.find(w => w.id === 'sourdough' && w.collection === 'menu')!.data).toEqual({ finishedGoodsStock: 5 });
    expect(plan.runIds).toHaveLength(2);
  });

  it('several rows share one session id; a single row gets none', () => {
    const many = planProductionSession([row('croissant', 1) as any, row('sourdough', 1) as any], state(), ids());
    const one = planProductionSession([row('croissant', 1) as any], state(), ids());
    if (many.ok === false || one.ok === false) throw new Error('expected ok');
    expect(many.sessionId).toBeTruthy();
    const runs = many.writes.filter(w => w.collection === 'productionRuns');
    expect(runs.every(w => w.data.productionSessionId === many.sessionId)).toBe(true);
    expect(one.sessionId).toBeUndefined();
    expect(one.writes.find(w => w.collection === 'productionRuns')!.data).not.toHaveProperty('productionSessionId');
  });

  it('the same item twice adds both to its stock', () => {
    const plan = planProductionSession([row('croissant', 2) as any, row('croissant', 3) as any], state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.writes.find(w => w.collection === 'menu')!.data).toEqual({ finishedGoodsStock: 5 });
  });

  it('saves nothing, and says which row, when one cannot be planned', () => {
    const plan = planProductionSession([row('croissant', 2) as any, row('nope', 1) as any], state(), ids());
    expect(plan).toMatchObject({ ok: false, failedIndex: 1 });
  });

  it('keeps an existing session id when retrying', () => {
    const plan = planProductionSession([row('croissant', 2) as any], state(), ids(), 'sess-1');
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.sessionId).toBe('sess-1');
  });
});
