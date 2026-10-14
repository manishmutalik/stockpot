import { describe, it, expect } from 'vitest';
import { giveBack, isMadeToOrder, madeToOrderSpend, madeToOrderUse, needsFor, saleNeeds, shortagesIn, takeForSale } from '../madeToOrder';
import { reorderSuggestions } from '../reorder';
import type { MenuItem, Order, RawMaterial } from '../../types';

const cream: RawMaterial = { id: 'cream', name: 'Whipping cream', unit: 'l', initialStock: 1, costPerUnit: 400, category: 'Raw Materials', threshold: 0, dateAdded: '2026-01-01' };
const base: MenuItem = { id: 'base', name: 'Sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 2, recipe: [] };
const cake: MenuItem = { id: 'cake', name: 'Pineapple cake', sellingPrice: 900, madeToOrder: true, recipe: [{ materialId: 'cream', amount: 150, unit: 'ml' }, { materialId: 'gone', amount: 5, unit: 'g' }], parts: [{ itemId: 'base', quantity: 1 }] };
const stock = { materials: [cream], menu: [base, cake] };

describe('made to order', () => {
  it('knows an item made to order', () => {
    expect(isMadeToOrder(cake)).toBe(true);
    expect(isMadeToOrder(base)).toBe(false);
    expect(isMadeToOrder(undefined)).toBe(false);
  });

  it('works out what a sale takes, in each material\'s own unit, with what the materials cost', () => {
    // 2 × 150 ml is 0.3 l at ₹400 a litre; a material that is gone is left out.
    expect(needsFor(cake, 2, stock)).toEqual({ materials: [{ materialId: 'cream', amount: 0.3 }], parts: [{ itemId: 'base', quantity: 2 }], cost: 120 });
  });

  it('takes and gives back the same, leaving stock as it was', () => {
    const t = takeForSale(cake, 3, stock);
    expect(t.stock.materials[0].initialStock).toBe(0.55);
    expect(t.stock.menu[0].finishedGoodsStock).toBe(-1);
    expect(shortagesIn(t.stock, [t.taken])).toEqual([{ materialId: 'base', name: 'Sponge base', unit: 'pcs', short: 1 }]);
    const back = giveBack(t.taken, t.stock);
    expect(back.stock.materials[0].initialStock).toBe(1);
    expect(back.stock.menu[0].finishedGoodsStock).toBe(2);
  });

  it('lists what a sale needs against what is there, for the order form', () => {
    expect(saleNeeds(cake, 3, stock)).toEqual([
      { id: 'base', name: 'Sponge base', unit: 'pcs', need: 3, have: 2, part: true },
      { id: 'cream', name: 'Whipping cream', unit: 'l', need: 0.45, have: 1, part: false },
    ]);
  });

  it('counts what made-to-order sales used and spent, leaving out cancelled ones and those that took nothing', () => {
    const orders = [
      { date: '2026-10-10', taken: { materials: [{ materialId: 'cream', amount: 0.3 }], parts: [], cost: 120 } },
      { date: '2026-10-11', taken: { materials: [{ materialId: 'cream', amount: 0.15 }], parts: [], cost: 60 }, cancelledOn: '2026-10-11' },
      { date: '2026-10-12', taken: null },
      { date: '2026-10-12' },
    ] as Pick<Order, 'date' | 'taken' | 'cancelledOn'>[];
    expect(madeToOrderUse(orders)).toEqual([{ date: '2026-10-10', materials: [{ materialId: 'cream', amount: 0.3 }] }]);
    expect(madeToOrderSpend(orders)).toBe(120);
  });

  it('feeds the reorder forecast, so cream used in cakes counts as use', () => {
    const today = '2026-10-14';
    const orders = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, taken: { materials: [{ materialId: 'cream', amount: 0.3 }], parts: [], cost: 0 } }));
    const input = { materials: [{ ...cream, remaining: 1, dateAdded: '2026-09-01', threshold: 0 }], menu: [], productionRuns: [], wastageLogs: [], today };
    expect(reorderSuggestions(input).suggestions).toEqual([]);
    const withSales = reorderSuggestions({ ...input, orders }).suggestions;
    expect(withSales.map(s => s.materialId)).toEqual(['cream']);
  });
});
