import { describe, it, expect } from 'vitest';
import { PACKAGING_CATEGORY, recipeUnitCosts, resolveItemName, resolveUnitCosts, resolveUnitPrice, stampFor } from '../orderPricing';

const materials: any[] = [
  { id: 'flour', unit: 'kg', costPerUnit: 45, category: 'Raw Materials', gstRate: 0 },
  { id: 'butter', unit: 'kg', costPerUnit: 500, category: 'Raw Materials', gstRate: 12 },
  { id: 'box', unit: 'pcs', costPerUnit: 12, category: PACKAGING_CATEGORY, gstRate: 18 },
];
const cake: any = {
  id: 'cake', name: 'Chocolate Cake', sellingPrice: 600,
  recipe: [{ materialId: 'flour', amount: 200, unit: 'g' }, { materialId: 'butter', amount: 100, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }],
};
const order = (over: Record<string, any> = {}): any => ({ id: 'o1', menuItemId: 'cake', quantity: 2, date: '2026-03-10', ...over });

describe('recipeUnitCosts', () => {
  it('splits ingredient and packaging cost, converting units, and works out the input GST inside them', () => {
    const c = recipeUnitCosts(cake.recipe, materials);
    expect(c.ingredients).toBeCloseTo(0.2 * 45 + 0.1 * 500, 6); // 9 + 50
    expect(c.packaging).toBeCloseTo(12, 6);
    expect(c.inputGst).toBeCloseTo(50 * 0.12 + 12 * 0.18, 6);
  });
  it('ignores a material that no longer exists', () => {
    expect(recipeUnitCosts([{ materialId: 'gone', amount: 5, unit: 'g' }], materials)).toEqual({ ingredients: 0, packaging: 0, inputGst: 0 });
  });
});

describe('stampFor', () => {
  it('records the price, costs, input GST and name as they are now', () => {
    expect(stampFor(cake, materials)).toEqual({
      unitPriceAtSale: 600, unitIngredientCostAtSale: 59, unitPackagingCostAtSale: 12, unitInputGstAtSale: 8.16, itemNameAtSale: 'Chocolate Cake',
    });
  });
  it('uses the real price paid when one is given, and the menu price otherwise', () => {
    expect(stampFor(cake, materials, 550).unitPriceAtSale).toBe(550);
    for (const bad of [undefined, 0, -5, NaN]) expect(stampFor(cake, materials, bad).unitPriceAtSale).toBe(600);
  });
});

describe('resolveUnitPrice', () => {
  it('uses the stamped price, however the menu has changed since', () => {
    const o = order({ unitPriceAtSale: 600 });
    expect(resolveUnitPrice(o, [{ ...cake, sellingPrice: 700 }])).toEqual({ value: 600, estimated: false });
    expect(resolveUnitPrice(o, [])).toEqual({ value: 600, estimated: false }); // even if the item was deleted
  });
  it("falls back to today's price for an old order, and says it is estimated", () => {
    expect(resolveUnitPrice(order(), [cake])).toEqual({ value: 600, estimated: true });
    expect(resolveUnitPrice(order(), [])).toEqual({ value: 0, estimated: true });
  });
  it('treats a stamped price of 0 as a real price (a free item), not a missing one', () => {
    expect(resolveUnitPrice(order({ unitPriceAtSale: 0 }), [cake])).toEqual({ value: 0, estimated: false });
  });
});

describe('resolveUnitCosts', () => {
  it('uses the stamped costs, however material costs have changed since', () => {
    const o = order({ unitIngredientCostAtSale: 59, unitPackagingCostAtSale: 12, unitInputGstAtSale: 8.16 });
    const dearer = materials.map(m => ({ ...m, costPerUnit: m.costPerUnit * 2 }));
    expect(resolveUnitCosts(o, [cake], dearer)).toEqual({ ingredients: 59, packaging: 12, inputGst: 8.16, estimated: false });
  });
  it("falls back to the recipe at today's costs for an old order, and says it is estimated", () => {
    const c = resolveUnitCosts(order(), [cake], materials);
    expect(c.ingredients).toBeCloseTo(59, 6);
    expect(c.packaging).toBeCloseTo(12, 6);
    expect(c.estimated).toBe(true);
  });
  it('keeps stamped costs but estimates only the input GST when that part is missing', () => {
    const c = resolveUnitCosts(order({ unitIngredientCostAtSale: 40, unitPackagingCostAtSale: 5 }), [cake], materials);
    expect(c.ingredients).toBe(40);
    expect(c.packaging).toBe(5);
    expect(c.inputGst).toBeCloseTo(8.16, 6);
    expect(c.estimated).toBe(true);
  });
});

describe('resolveItemName', () => {
  it('prefers the name at sale, then the menu, then a generic label', () => {
    expect(resolveItemName(order({ itemNameAtSale: 'Old Name' }), [cake])).toBe('Old Name');
    expect(resolveItemName(order(), [cake])).toBe('Chocolate Cake');
    expect(resolveItemName(order(), [])).toBe('Item');
  });
});
