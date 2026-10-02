import { describe, it, expect } from 'vitest';
import { buildDemoData } from '../demoData';
import { convertAmount } from '../conversions';

const TODAY = '2026-03-10';
const demo = buildDemoData('uid1', TODAY);
const byId = <T extends { id: string }>(list: T[], id: string) => list.find(x => x.id === id)!;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const recipeCost = (menuId: string) =>
  byId(demo.menu, menuId).recipe.reduce((total, req) => {
    const mat = byId(demo.materials, req.materialId);
    return total + convertAmount(req.amount, req.unit, mat.unit) * mat.costPerUnit;
  }, 0);

describe('demo data adds up', () => {
  it('has consistent references and unique ids', () => {
    for (const list of [demo.materials, demo.menu, demo.orders, demo.productionRuns]) {
      expect(new Set(list.map(x => x.id)).size).toBe(list.length);
    }
    for (const item of demo.menu) for (const req of item.recipe) expect(demo.materials.some(m => m.id === req.materialId)).toBe(true);
    for (const o of demo.orders) expect(demo.menu.some(m => m.id === o.menuItemId)).toBe(true);
    for (const r of demo.productionRuns) expect(demo.menu.some(m => m.id === r.recipeId)).toBe(true);
  });

  it('prices a croissant at ₹57.12 of materials, worked out by hand', () => {
    // 150g maida x 0.045 + 15g sugar x 0.048 + 75g butter x 0.57 + 50ml milk x 0.068 + 5g yeast x 0.7
    expect(recipeCost('menu_croissant')).toBeCloseTo(6.75 + 0.72 + 42.75 + 3.4 + 3.5, 6);
    expect(recipeCost('menu_croissant')).toBeCloseTo(57.12, 6);
    // 400g atta x 0.048 + 100g maida x 0.045 + 15g sugar x 0.048 + 6g yeast x 0.7
    expect(recipeCost('menu_bread')).toBeCloseTo(19.2 + 4.5 + 0.72 + 4.2, 6);
    expect(recipeCost('menu_bread')).toBeCloseTo(28.62, 6);
  });

  it('costs every production run at quantity produced x recipe cost', () => {
    for (const run of demo.productionRuns) {
      expect(run.costTotal).toBeCloseTo(run.quantityProduced * recipeCost(run.recipeId), 1);
    }
    // 25 croissants at ₹57.12 each
    expect(byId(demo.productionRuns, 'run_7').costTotal).toBe(1428);
  });

  it('shelf stock is units made (after waste) minus units ordered, and matches the batches', () => {
    const produced = (id: string) => sum(demo.productionRuns.filter(r => r.recipeId === id).map(r => r.quantityYield ?? r.quantityProduced));
    const ordered = (id: string) => sum(demo.orders.filter(o => o.menuItemId === id).map(o => o.quantity));
    expect(ordered('menu_croissant')).toBe(56);
    expect(byId(demo.menu, 'menu_croissant').finishedGoodsStock).toBe(75 - 56);
    expect(byId(demo.menu, 'menu_muffin').finishedGoodsStock).toBe(74 - 59); // 30 + 19 (one lost) + 25 made
    expect(byId(demo.menu, 'menu_bread').finishedGoodsStock).toBe(45 - 33);
    for (const item of demo.menu) {
      expect(item.finishedGoodsStock).toBe(produced(item.id) - ordered(item.id));
      const left = sum(demo.productionRuns.filter(r => r.recipeId === item.id).map(r => r.remainingQuantity));
      expect(item.finishedGoodsStock).toBe(left);
    }
  });

  it('takes ordered units from the oldest batches first, and no batch holds more than it made', () => {
    const run = (id: string) => byId(demo.productionRuns, id);
    // croissants: the two oldest batches are fully sold, the newest keeps what is left
    expect([run('run_1').remainingQuantity, run('run_4').remainingQuantity, run('run_7').remainingQuantity]).toEqual([0, 0, 19]);
    for (const r of demo.productionRuns) {
      expect(r.remainingQuantity).toBeGreaterThanOrEqual(0);
      expect(r.remainingQuantity).toBeLessThanOrEqual(r.quantityYield ?? r.quantityProduced);
    }
  });

  it('never runs out of finished goods on any day (orders only take what has been made)', () => {
    const days = [...new Set([...demo.orders.map(o => o.date), ...demo.productionRuns.map(r => r.date)])].sort();
    for (const item of demo.menu) {
      let stock = 0;
      for (const day of days) {
        stock += sum(demo.productionRuns.filter(r => r.recipeId === item.id && r.date === day).map(r => r.quantityYield ?? r.quantityProduced));
        stock -= sum(demo.orders.filter(o => o.menuItemId === item.id && o.date === day).map(o => o.quantity));
        expect(stock).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('raw-material stock is what was bought minus what the runs used', () => {
    const used = (materialId: string) => sum(demo.productionRuns.map(run => {
      const req = byId(demo.menu, run.recipeId).recipe.find(r => r.materialId === materialId);
      return req ? convertAmount(req.amount, req.unit, byId(demo.materials, materialId).unit) * run.quantityProduced : 0;
    }));
    // maida: 75 croissants x 150g + 75 muffins x 120g + 45 loaves x 100g = 24,750g of 60,000g bought
    expect(used('m_flour')).toBe(24750);
    expect(byId(demo.materials, 'm_flour').initialStock).toBe(60000 - 24750);
    // atta: 45 loaves x 400g = 18,000g of 40,000g bought
    expect(byId(demo.materials, 'm_atta').initialStock).toBe(40000 - 18000);
    // yeast: 75 x 5g + 45 x 6g = 645g of 900g bought
    expect(byId(demo.materials, 'm_yeast').initialStock).toBe(900 - 645);
    // eggs: one per muffin, all 75 baked (the lost muffin still used its egg)
    expect(byId(demo.materials, 'm_eggs').initialStock).toBe(150 - 75);
    // packaging is not part of any recipe, so untouched
    expect(byId(demo.materials, 'm_box').initialStock).toBe(300);
    for (const m of demo.materials) expect(m.initialStock).toBeGreaterThanOrEqual(0);
  });

  it('shows exactly one Low Stock alert (yeast) and keeps every other material above its threshold', () => {
    const low = demo.materials.filter(m => m.threshold > 0 && m.initialStock <= m.threshold);
    expect(low.map(m => m.id)).toEqual(['m_yeast']);
  });

  it('fulfils past orders and leaves only today\'s pending', () => {
    for (const o of demo.orders) expect(o.fulfilled).toBe(o.date !== TODAY);
    expect(demo.orders.filter(o => !o.fulfilled)).toHaveLength(3);
  });

  it('gives sold-out batches a past expiry and batches with stock a present or future one', () => {
    for (const r of demo.productionRuns) {
      expect(r.expiryDate >= r.date).toBe(true);
      if (r.remainingQuantity > 0) expect(r.expiryDate >= TODAY).toBe(true);
    }
  });

  it('makes a healthy margin on every item', () => {
    for (const item of demo.menu) {
      const margin = (item.sellingPrice - recipeCost(item.id)) / item.sellingPrice;
      expect(margin).toBeGreaterThan(0.5);
    }
  });

  it('is set up for an Indian business: rupees (GST off), and rupee-scale prices', () => {
    expect(demo.settings.currency).toEqual({ code: 'INR', symbol: '₹' });
    expect((demo.settings as any).gstApplicable).toBeFalsy();
    expect(demo.settings.phone).toMatch(/^\+91 /);
    for (const o of demo.orders) expect(o.customerPhone).toMatch(/^\+91 /);
    // typical Indian retail prices: staples cost tens of rupees a kilo, butter hundreds
    expect(byId(demo.materials, 'm_flour').costPerUnit * 1000).toBeCloseTo(45, 6);
    expect(byId(demo.materials, 'm_butter').costPerUnit * 1000).toBeCloseTo(570, 6);
    for (const item of demo.menu) {
      expect(item.sellingPrice).toBeGreaterThanOrEqual(50);
      expect(item.sellingPrice).toBeLessThanOrEqual(300);
    }
  });

  it('is reproducible for a given day', () => {
    expect(buildDemoData('uid1', TODAY)).toEqual(demo);
  });

  it('stamps every order with its price and cost, so the demo shows exact rather than estimated figures', () => {
    for (const o of demo.orders) {
      const item = byId(demo.menu, o.menuItemId);
      expect(o.unitPriceAtSale).toBe(item.sellingPrice);
      expect(o.itemNameAtSale).toBe(item.name);
      // the stamped cost is exactly what the recipe costs at the demo's material prices
      expect(o.unitIngredientCostAtSale + o.unitPackagingCostAtSale).toBeCloseTo(recipeCost(o.menuItemId), 4);
    }
    // the box is not in any recipe, so there is no packaging cost on any demo order
    expect(demo.orders.every(o => o.unitPackagingCostAtSale === 0)).toBe(true);
  });

  it('records how each order was paid, with the fee rate that applied, so the demo shows payment fees', () => {
    const rates = demo.settings.paymentFeeRates!;
    for (const o of demo.orders as any[]) {
      expect(['upi', 'cash', 'card', 'other']).toContain(o.paymentMethod);
      expect(o.paymentFeeRate).toBe(rates[o.paymentMethod as 'upi'] ?? 0);
    }
    expect(new Set((demo.orders as any[]).map(o => o.paymentMethod)).size).toBeGreaterThan(1);
    expect(Object.values(rates).some(r => r > 0)).toBe(true);
  });

  it('gives one order a discount (on a past, fulfilled order), smaller than what it was billed', () => {
    const discounted = (demo.orders as any[]).filter(o => o.discount);
    expect(discounted).toHaveLength(1);
    expect(discounted[0].fulfilled).toBe(true);
    expect(discounted[0].discount).toBeLessThan(byId(demo.menu, discounted[0].menuItemId).sellingPrice * discounted[0].quantity);
  });

  it('has fixed monthly costs, so True Profit is lower than net profit', () => {
    expect(demo.settings.fixedCosts!.length).toBeGreaterThan(0);
    for (const c of demo.settings.fixedCosts!) expect(c.monthlyAmount).toBeGreaterThan(0);
    expect(new Set(demo.settings.fixedCosts!.map(c => c.id)).size).toBe(demo.settings.fixedCosts!.length);
  });

  it('has a price history for every material, ending at the material\'s current cost', () => {
    for (const mat of demo.materials) {
      const entries = demo.priceLog.filter(e => e.materialId === mat.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].source).toBe('initial');
      for (const e of entries) { expect(e.unit).toBe(mat.unit); expect(e.unitCost).toBeGreaterThan(0); }
      const last = entries[entries.length - 1];
      expect(last.macAfter).toBeCloseTo(mat.costPerUnit, 5);
    }
    expect(new Set(demo.priceLog.map(e => e.id)).size).toBe(demo.priceLog.length);
    expect(demo.priceLog.every(e => demo.materials.some(m => m.id === e.materialId))).toBe(true);
  });

  it('shows prices that moved: some materials were topped up at a different price, with the average in between', () => {
    const butter = demo.priceLog.filter(e => e.materialId === 'm_butter').sort((a, b) => a.createdAt - b.createdAt);
    expect(butter).toHaveLength(2);
    expect(butter[1].unitCost).toBeGreaterThan(butter[0].unitCost);
    expect(butter[1].macAfter!).toBeGreaterThan(butter[0].unitCost);
    expect(butter[1].macAfter!).toBeLessThan(butter[1].unitCost);
    // What was bought in the two lots is the material's opening stock in the demo
    const bought = butter.reduce((sum, e) => sum + e.quantity!, 0);
    const blended = butter.reduce((sum, e) => sum + e.quantity! * e.unitCost, 0) / bought;
    expect(blended).toBeCloseTo(byId(demo.materials, 'm_butter').costPerUnit, 5);
  });
});
