import { describe, it, expect } from 'vitest';
import type { MenuItem, RawMaterial } from '../../types';
import { costView } from '../itemParts';
import { summarizeMenu, unpricedMaterials } from '../menuStats';
import { itemsNeedingRepricing, marginDrift, pricingStamp, recipesAffectedBy } from '../pricing';
import { resolveUnitCosts } from '../orderPricing';
import { planOrderGroup } from '../plans/planOrders';
import { summarizeProduction } from '../productionStats';
import { summarizeWastage } from '../wastageStats';
import { productionShortages } from '../quickParse';

const mat = (id: string, unit: string, costPerUnit: number, category = 'Raw Materials'): RawMaterial =>
  ({ id, name: id === 'gel' ? 'Cake gel' : id, unit, costPerUnit, initialStock: 100, category, threshold: 0, dateAdded: '2026-01-01' });
const materials = [mat('gel', 'kg', 300), mat('eggs', 'pcs', 7), mat('cream', 'kg', 400), mat('box1', 'pcs', 25, 'Packaging Materials'), mat('nuts', 'kg', 0)];
const base: MenuItem = { id: 'base', name: 'Vanilla sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 10,
  recipe: [{ materialId: 'gel', amount: 200, unit: 'g' }, { materialId: 'eggs', amount: 4, unit: 'pcs' }] }; // ₹60 + ₹28 = ₹88
const cake: MenuItem = { id: 'cake', name: 'Pineapple Cream Cake 1 kg', sellingPrice: 900, finishedGoodsStock: 5,
  recipe: [{ materialId: 'cream', amount: 150, unit: 'g' }, { materialId: 'box1', amount: 1, unit: 'pcs' }], parts: [{ itemId: 'base', quantity: 1 }] }; // +60 +25 = ₹173
const menu = [base, cake];

describe('costs count an item\'s parts', () => {
  it('stamps an order with the base inside the cake\'s ingredient cost, packaging apart', () => {
    const plan = planOrderGroup({ common: { date: '2026-10-14' } as never, lineItems: [{ menuItemId: 'cake', quantity: 1 }], menu, materials, today: '2026-10-14', ctx: { newId: () => 'o1' } });
    if (plan.ok === false) throw new Error(plan.error.message);
    expect(plan.orders[0].unitIngredientCostAtSale).toBeCloseTo(88 + 60, 6);
    expect(plan.orders[0].unitPackagingCostAtSale).toBe(25);
  });
  it('estimates an old unstamped order the same way', () => {
    expect(resolveUnitCosts({ id: 'x', menuItemId: 'cake', quantity: 1, date: '2026-01-01' }, menu, materials).ingredients).toBeCloseTo(148, 6);
  });
  it('names the base\'s ingredient when its price moves, in the cake\'s drift', () => {
    const priced = { ...cake, ...pricingStamp(costView(cake, menu), materials, '2026-10-01') };
    const dearer = materials.map(m => (m.id === 'gel' ? { ...m, costPerUnit: 450 } : m));
    const drift = marginDrift(costView(priced, [base, priced]), dearer, {})!;
    expect(drift.costNow - drift.costAtPricing).toBeCloseTo(30, 6);
    expect(drift.drivers[0]).toMatchObject({ materialId: 'gel' });
    expect(recipesAffectedBy('gel', menu, materials).map(r => r.menuItemId).sort()).toEqual(['base', 'cake']);
  });
  it('keeps items made only for other items out of the menu\'s figures and repricing', () => {
    expect(summarizeMenu(menu, materials).itemCount).toBe(1);
    expect(summarizeMenu(menu, materials).needsReview.map(m => m.id)).toEqual([]);
    expect(itemsNeedingRepricing([{ ...base, sellingPrice: 10, costAtPricing: 1, pricedAt: '2026-01-01' }], materials, {})).toEqual([]);
  });
  it('says a cake is cost incomplete when its base uses a material with no price', () => {
    const nutty = { ...base, recipe: [...base.recipe, { materialId: 'nuts', amount: 10, unit: 'g' }] };
    expect(unpricedMaterials(costView(cake, [nutty, cake]), materials)).toEqual(['nuts']);
  });
});

describe('production spend counts each ingredient once', () => {
  const runs = [
    { id: 'r1', recipeId: 'base', quantityProduced: 5, date: '2026-10-14', costTotal: 440, createdAt: 0 },
    { id: 'r2', recipeId: 'cake', quantityProduced: 5, date: '2026-10-14', costTotal: 865, partsCost: 440, partsUsed: [{ itemId: 'base', quantity: 5 }], createdAt: 0 },
  ];
  it('in the production totals and wastage\'s loss against production', () => {
    expect(summarizeProduction(runs, '2026-10-14').totalCost).toBe(440 + 425);
    const w = summarizeWastage([{ id: 'w', type: 'material', itemId: 'gel', itemName: 'gel', quantity: 1, unit: 'kg', reason: 'Expired', date: '2026-10-14', cost: 86.5 } as never], runs as never);
    expect(w.lossVsProductionPercent).toBeCloseTo(10, 6); // 86.5 of 865, not of 1,305
  });
  it('reports a base used beyond what was made, as a shortage in pieces', () => {
    expect(productionShortages({ materials, menu: [{ ...base, finishedGoodsStock: -1.5 }, cake] }, ['cake'])).toEqual([
      { materialId: 'base', name: 'Vanilla sponge base', unit: 'pcs', short: 1.5 },
    ]);
  });
});
