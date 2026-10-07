import { describe, it, expect } from 'vitest';
import { planRestock } from '../planInventory';
import { collapseWrites } from '../types';
import type { RawMaterial } from '../../../types';

const maida = (over: Partial<RawMaterial> = {}): RawMaterial =>
  ({ id: 'maida', name: 'Maida', unit: 'kg', initialStock: 10, costPerUnit: 80, category: 'Raw Materials', threshold: 2, dateAdded: '2026-01-01', ...over });
const ctx = { newId: () => 'log1', now: () => Date.parse('2026-10-06T10:00:00Z') };

describe('planRestock', () => {
  it('adds to stock and moves the cost to the moving average of what was on hand and what was bought', () => {
    const plan = planRestock({ material: maida(), quantity: 5, total: 450, ctx });
    if (plan.ok === false) throw new Error('expected ok');
    // 10 kg at 80 = 800, plus 450 spent on 5 kg = 1250 over 15 kg
    expect(plan.newStock).toBe(15);
    expect(plan.previousCostPerUnit).toBe(80);
    expect(plan.newCostPerUnit).toBeCloseTo(83.333333, 6);
    expect(plan.writes[0]).toEqual({ collection: 'materials', id: 'maida', merge: true, data: { initialStock: 15, costPerUnit: 83.333333 } });
  });

  it('writes the price-log entry with what was actually paid per unit, in the same plan', () => {
    const plan = planRestock({ material: maida(), quantity: 5, total: 450, ctx });
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.writes[1]).toMatchObject({ collection: 'priceLog', id: 'log1', merge: false });
    expect(plan.writes[1].data).toMatchObject({
      id: 'log1', materialId: 'maida', unit: 'kg', unitCost: 90, quantity: 5, macAfter: 83.333333, source: 'restock', date: '2026-10-06', createdAt: ctx.now(),
    });
  });

  it('converts a quantity given in another unit into the material\'s own (500 g for 520 is 1,040 a kg)', () => {
    const plan = planRestock({ material: maida({ initialStock: 0, costPerUnit: 0 }), quantity: 500, quantityUnit: 'g', total: 520, ctx });
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.newStock).toBe(0.5);
    expect(plan.writes[1].data.unitCost).toBe(1040);
    expect(plan.newCostPerUnit).toBe(1040);
  });

  it('records an expiry date when one is given, and not otherwise', () => {
    const withDate = planRestock({ material: maida(), quantity: 1, total: 80, expiryDate: '2026-12-01', ctx });
    const without = planRestock({ material: maida(), quantity: 1, total: 80, ctx });
    if (withDate.ok === false || without.ok === false) throw new Error('expected ok');
    expect(withDate.writes[0].data.expiryDate).toBe('2026-12-01');
    expect(without.writes[0].data).not.toHaveProperty('expiryDate');
  });

  it('refuses a quantity that is nothing, or negative', () => {
    expect(planRestock({ material: maida(), quantity: 0, total: 10, ctx })).toEqual({ ok: false, reason: 'invalid_quantity' });
    expect(planRestock({ material: maida(), quantity: -2, total: 10, ctx })).toEqual({ ok: false, reason: 'invalid_quantity' });
  });

  it('converts litres and millilitres both ways, and prices per the material\'s own unit', () => {
    const oil = (over: Partial<RawMaterial> = {}) => maida({ id: 'oil', unit: 'l', initialStock: 0, costPerUnit: 0, ...over });
    const inMl = planRestock({ material: oil(), quantity: 500, quantityUnit: 'ml', total: 90, ctx });
    if (inMl.ok === false) throw new Error('expected ok');
    expect(inMl.newStock).toBe(0.5);
    expect(inMl.newCostPerUnit).toBe(180); // 90 for half a litre
    const perMl = planRestock({ material: oil({ unit: 'ml' }), quantity: 2, quantityUnit: 'l', total: 360, ctx });
    if (perMl.ok === false) throw new Error('expected ok');
    expect(perMl.newStock).toBe(2000);
    expect(perMl.newCostPerUnit).toBe(0.18); // 360 for 2000 ml
  });

  it('works out 500 g bought for 92.50 as 185 a kg, with stock already on hand', () => {
    const plan = planRestock({ material: maida({ id: 'khapli', unit: 'kg', initialStock: 2, costPerUnit: 185 }), quantity: 500, quantityUnit: 'g', total: 92.5, ctx });
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.newStock).toBe(2.5);
    expect(plan.newCostPerUnit).toBe(185);
  });

  it('refuses a unit that does not convert to the material\'s, rather than passing the quantity through', () => {
    expect(planRestock({ material: maida({ unit: 'pcs' }), quantity: 5, quantityUnit: 'kg', total: 100, ctx })).toEqual({ ok: false, reason: 'unit_mismatch' });
    expect(planRestock({ material: maida({ unit: 'kg' }), quantity: 5, quantityUnit: 'l', total: 100, ctx })).toEqual({ ok: false, reason: 'unit_mismatch' });
    expect(planRestock({ material: maida({ unit: 'ml' }), quantity: 5, quantityUnit: 'g', total: 100, ctx })).toEqual({ ok: false, reason: 'unit_mismatch' });
  });

  it('keeps real precision on a cost per gram', () => {
    const plan = planRestock({ material: maida({ unit: 'g', initialStock: 1000, costPerUnit: 0.04 }), quantity: 500, total: 25, ctx });
    if (plan.ok === false) throw new Error('expected ok');
    expect(plan.newCostPerUnit).toBeCloseTo(0.043333, 6); // not rounded to 0.04
  });
});

describe('collapseWrites', () => {
  it('keeps one write per document, with later fields replacing earlier ones, in first-seen order', () => {
    const out = collapseWrites([
      { collection: 'materials', id: 'flour', data: { initialStock: 800 }, merge: true },
      { collection: 'menu', id: 'a', data: { finishedGoodsStock: 2 }, merge: true },
      { collection: 'materials', id: 'flour', data: { initialStock: 700 }, merge: true },
    ]);
    expect(out).toEqual([
      { collection: 'materials', id: 'flour', data: { initialStock: 700 }, merge: true },
      { collection: 'menu', id: 'a', data: { finishedGoodsStock: 2 }, merge: true },
    ]);
  });
  it('does not change what it was given', () => {
    const input = [{ collection: 'menu' as const, id: 'a', data: { x: 1 }, merge: true }, { collection: 'menu' as const, id: 'a', data: { y: 2 }, merge: true }];
    collapseWrites(input);
    expect(input[0].data).toEqual({ x: 1 });
  });
});
