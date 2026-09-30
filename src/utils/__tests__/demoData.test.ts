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

  it('prices a croissant at 1.5325 of materials, worked out by hand', () => {
    // 150g flour x 0.002 + 15g sugar x 0.0015 + 75g butter x 0.012 + 50ml milk x 0.0012 + 5g yeast x 0.05
    expect(recipeCost('menu_croissant')).toBeCloseTo(0.3 + 0.0225 + 0.9 + 0.06 + 0.25, 6);
    expect(recipeCost('menu_croissant')).toBeCloseTo(1.5325, 6);
    expect(recipeCost('menu_sourdough')).toBeCloseTo(1.5, 6); // 500g flour + 10g yeast
  });

  it('costs every production run at quantity produced x recipe cost', () => {
    for (const run of demo.productionRuns) {
      expect(run.costTotal).toBeCloseTo(run.quantityProduced * recipeCost(run.recipeId), 1);
    }
    // 25 croissants: about 38.31, not thousands
    expect(byId(demo.productionRuns, 'run_7').costTotal).toBe(38.31);
  });

  it('shelf stock is units made (after waste) minus units ordered, and matches the batches', () => {
    const produced = (id: string) => sum(demo.productionRuns.filter(r => r.recipeId === id).map(r => r.quantityYield ?? r.quantityProduced));
    const ordered = (id: string) => sum(demo.orders.filter(o => o.menuItemId === id).map(o => o.quantity));
    expect(ordered('menu_croissant')).toBe(56);
    expect(byId(demo.menu, 'menu_croissant').finishedGoodsStock).toBe(75 - 56);
    expect(byId(demo.menu, 'menu_muffin').finishedGoodsStock).toBe(74 - 59); // 30 + 19 (one lost) + 25 made
    expect(byId(demo.menu, 'menu_sourdough').finishedGoodsStock).toBe(45 - 33);
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
    // flour: 75 croissants x 150g + 75 muffins x 120g + 45 loaves x 500g = 42,750g of 60,000g bought
    expect(used('m_flour')).toBe(42750);
    expect(byId(demo.materials, 'm_flour').initialStock).toBe(60000 - 42750);
    // yeast: 75 x 5g + 45 x 10g = 825g of 1,000g bought
    expect(byId(demo.materials, 'm_yeast').initialStock).toBe(1000 - 825);
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

  it('is reproducible for a given day', () => {
    expect(buildDemoData('uid1', TODAY)).toEqual(demo);
  });
});
