import { describe, it, expect } from 'vitest';
import type { MenuItem, RawMaterial } from '../../types';
import { costMenu, costView, effectiveRecipe, forSale, itemsUsing, partCandidates, partsNeeded, runSpend, wouldLoop } from '../itemParts';
import { recipeCost } from '../menuStats';
import { planProductionRun, planProductionSession, type Working } from '../plans/planProduction';

const mat = (id: string, unit: string, costPerUnit: number, initialStock = 10000): RawMaterial =>
  ({ id, name: id, unit, costPerUnit, initialStock, category: 'Raw Materials', threshold: 0, dateAdded: '2026-01-01' });
const materials = [mat('gel', 'kg', 300), mat('eggs', 'pcs', 7), mat('cream', 'kg', 400), mat('box1', 'pcs', 25)];
// One batch of base (1 kg gel, 18 eggs) makes 4.5 bases, so one base is a 4.5th of it.
const base: MenuItem = { id: 'base', name: 'Vanilla sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 2, shelfLifeDays: 3,
  recipe: [{ materialId: 'gel', amount: 1000 / 4.5, unit: 'g' }, { materialId: 'eggs', amount: 4, unit: 'pcs' }] };
const cake1: MenuItem = { id: 'pine1', name: 'Pineapple Cream Cake 1 kg', sellingPrice: 900, finishedGoodsStock: 0,
  recipe: [{ materialId: 'cream', amount: 150, unit: 'g' }, { materialId: 'box1', amount: 1, unit: 'pcs' }], parts: [{ itemId: 'base', quantity: 1 }] };
const cakeHalf: MenuItem = { id: 'pineHalf', name: 'Pineapple Cream Cake ½ kg', sellingPrice: 500, recipe: [], parts: [{ itemId: 'base', quantity: 0.5 }] };
const hamper: MenuItem = { id: 'hamper', name: 'Diwali hamper', sellingPrice: 2500, recipe: [], parts: [{ itemId: 'pine1', quantity: 2 }] };
const menu = [base, cake1, cakeHalf, hamper];

describe('effectiveRecipe and costView', () => {
  it('writes a part\'s recipe into the item, scaled by how many go in', () => {
    expect(effectiveRecipe(cakeHalf, menu)).toEqual([
      { materialId: 'gel', amount: 111.111111, unit: 'g' }, { materialId: 'eggs', amount: 2, unit: 'pcs' },
    ]);
    // base 66.67 + 28 eggs; cream 60 + box 25
    expect(recipeCost(costView(cake1, menu).recipe, materials)).toBeCloseTo(66.6667 + 28 + 60 + 25, 3);
  });
  it('nests (a hamper of cakes of bases), and leaves an item without parts as it was', () => {
    expect(recipeCost(costView(hamper, menu).recipe, materials)).toBeCloseTo(2 * (66.6667 + 28 + 60 + 25), 3);
    expect(costView(base, menu)).toBe(base);
    expect(costMenu([base])).toEqual([base]);
  });
  it('ignores a missing part, and never loops even if the data has one', () => {
    const odd: MenuItem = { id: 'a', name: 'A', sellingPrice: 1, recipe: [{ materialId: 'eggs', amount: 1, unit: 'pcs' }], parts: [{ itemId: 'b', quantity: 1 }, { itemId: 'gone', quantity: 1 }] };
    const back: MenuItem = { id: 'b', name: 'B', sellingPrice: 1, recipe: [{ materialId: 'eggs', amount: 2, unit: 'pcs' }], parts: [{ itemId: 'a', quantity: 1 }] };
    expect(effectiveRecipe(odd, [odd, back]).map(l => l.amount)).toEqual([1, 2]);
  });
});

describe('loops, candidates and users', () => {
  it('refuses an item inside itself, directly or through others', () => {
    expect(wouldLoop(menu, 'base', 'base')).toBe(true);
    expect(wouldLoop(menu, 'base', 'pine1')).toBe(true); // pine1 contains base
    expect(wouldLoop(menu, 'base', 'hamper')).toBe(true); // through pine1
    expect(wouldLoop(menu, 'hamper', 'pineHalf')).toBe(false);
  });
  it('offers what can go in, made-for-other-items first', () => {
    expect(partCandidates(menu, 'pineHalf').map(m => m.id)).toEqual(['base', 'hamper', 'pine1']);
    expect(partCandidates(menu, 'base').map(m => m.id)).toEqual([]);
  });
  it('says which items use one, and which are sold', () => {
    expect(itemsUsing(menu, 'base').map(m => m.id)).toEqual(['pine1', 'pineHalf']);
    expect(forSale(menu).map(m => m.id)).toEqual(['pine1', 'pineHalf', 'hamper']);
  });
  it('works out the parts for a quantity, and what a run spent', () => {
    expect(partsNeeded(cakeHalf, 3)).toEqual([{ itemId: 'base', quantity: 1.5 }]);
    expect(runSpend({ costTotal: 540, partsCost: 300 })).toBe(240);
    expect(runSpend({ costTotal: 540 })).toBe(540);
  });
});

describe('making an item with parts', () => {
  const state = (): Working => ({ materials, menu });
  const ids = () => { let n = 0; return { newId: () => `id${n++}`, now: () => 1_760_000_000_000 }; };

  it('takes its own materials, takes the parts from their finished stock, and records what the parts were worth', () => {
    const plan = planProductionRun({ recipeId: 'pine1', quantityProduced: 3, date: '2026-10-14', costTotal: 1 }, state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    const byDoc = Object.fromEntries(plan.writes.map(w => [`${w.collection}/${w.id}`, w.data]));
    expect(byDoc['materials/cream']).toEqual({ initialStock: 10000 - 0.45 });
    expect(byDoc['materials/gel']).toBeUndefined(); // the base's gel was taken when the base was made
    expect(byDoc['menu/base']).toEqual({ finishedGoodsStock: -1 }); // 2 on the shelf, 3 used: short, as the owner was warned
    expect(byDoc['menu/pine1']).toEqual({ finishedGoodsStock: 3 });
    const run = byDoc['productionRuns/id0'] as Record<string, unknown>;
    expect(run.partsUsed).toEqual([{ itemId: 'base', quantity: 3 }]);
    expect(run.partsCost).toBeCloseTo(3 * 94.67, 1);
    expect(run.costTotal).toBeCloseTo(3 * (94.6667 + 85), 1); // its own materials and the bases, not the caller's 1
    expect(runSpend(run as { costTotal: number; partsCost: number })).toBeCloseTo(255, 1); // only the cream and boxes
  });

  it('in one session, bases made first are there for the cakes after', () => {
    const plan = planProductionSession([
      { recipeId: 'base', quantityProduced: 4.5, date: '2026-10-14', costTotal: 426 },
      { recipeId: 'pine1', quantityProduced: 4, date: '2026-10-14', costTotal: 0 },
      { recipeId: 'pineHalf', quantityProduced: 1, date: '2026-10-14', costTotal: 0 },
    ], state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.state.menu.find(m => m.id === 'base')!.finishedGoodsStock).toBe(2 + 4.5 - 4 - 0.5);
    expect(plan.state.materials.find(m => m.id === 'gel')!.initialStock).toBeCloseTo(10000 - 1, 6);
  });

  it('leaves an item without parts exactly as before', () => {
    const plan = planProductionRun({ recipeId: 'base', quantityProduced: 4.5, date: '2026-10-14', costTotal: 426 }, state(), ids());
    if (plan.ok === false) throw new Error('expected ok');
    const run = plan.writes.find(w => w.collection === 'productionRuns')!.data as Record<string, unknown>;
    expect(run.costTotal).toBe(426);
    expect(run.partsUsed).toBeUndefined();
  });
});
