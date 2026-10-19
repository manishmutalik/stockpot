import { describe, it, expect } from 'vitest';
import { buildCloudKitchenData } from '../cloudKitchenData';
import { financialsForRange } from '../profit';
import { marginDrift } from '../pricing';
import { costView } from '../itemParts';
import type { MenuItem, RawMaterial } from '../../types';

const TODAY = '2026-10-19';
const kitchen = buildCloudKitchenData('uid1', TODAY, 'owner@example.com');
const menu = kitchen.menu as unknown as MenuItem[];
const materials = kitchen.materials as unknown as RawMaterial[];
const byId = <T extends { id: string }>(list: T[], id: string) => list.find(x => x.id === id)!;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the cloud kitchen sample adds up', () => {
  it('refers only to its own materials and items, with unique ids', () => {
    const matIds = new Set(kitchen.materials.map(m => m.id));
    const itemIds = new Set(kitchen.menu.map(m => m.id));
    for (const item of kitchen.menu) {
      for (const r of item.recipe) expect(matIds.has(r.materialId)).toBe(true);
      for (const p of item.parts ?? []) expect(itemIds.has(p.itemId)).toBe(true);
    }
    for (const o of kitchen.orders) expect(itemIds.has(o.menuItemId)).toBe(true);
    expect(new Set(kitchen.orders.map(o => o.id)).size).toBe(kitchen.orders.length);
    expect(kitchen.settings.email).toBe('owner@example.com');
  });

  it('has three weeks of orders, mostly Indian dishes cooked to order, and leaves only today\'s pending', () => {
    expect(kitchen.orders.length).toBeGreaterThan(100);
    expect(new Set(kitchen.orders.map(o => o.date)).size).toBe(21);
    for (const o of kitchen.orders) expect(o.fulfilled).toBe(o.date < TODAY);
    for (const id of ['menu_thali', 'menu_biryani', 'menu_pbm', 'menu_cake']) expect(byId(kitchen.menu, id).madeToOrder).toBe(true);
    expect(kitchen.orders.filter(o => o.deliveryFee).length).toBeGreaterThan(30);
  });

  it('never runs a material below zero, and shows exactly one Low Stock alert (kasuri methi)', () => {
    for (const m of kitchen.materials) expect(m.initialStock).toBeGreaterThanOrEqual(0);
    expect(kitchen.materials.filter(m => m.initialStock < m.threshold).map(m => m.id)).toEqual(['m_kasuri']);
  });

  it('keeps the makhani gravy by the kg: made in runs, taken by each plate, the rest on the shelf', () => {
    const gravy = byId(kitchen.menu, 'menu_gravy');
    expect(gravy.countedIn).toBe('kg');
    const made = sum(kitchen.productionRuns.map(r => r.quantityYield ?? r.quantityProduced));
    const used = sum(kitchen.orders.flatMap(o => (o.taken?.parts ?? []).map(p => p.quantity)));
    expect(used).toBeGreaterThan(10);
    expect(gravy.finishedGoodsStock).toBeCloseTo(made - used, 3);
    expect(gravy.finishedGoodsStock).toBeGreaterThan(0);
    // A batch still holding gravy is past its date, so the freshness alert shows.
    expect(kitchen.productionRuns.some(r => r.remainingQuantity > 0 && r.expiryDate < TODAY)).toBe(true);
  });

  it('shows the paneer price rise on Paneer Butter Masala: under its 65% target, paneer +20%', () => {
    const pbm = byId(menu, 'menu_pbm');
    const drift = marginDrift(costView(pbm, menu), materials, {});
    expect(drift?.alert).toBe('below_target');
    expect(drift!.drivers[0].materialId).toBe('m_paneer');
    expect(drift!.drivers[0].pctChange).toBeCloseTo(20, 0);
    // Nothing else drifted enough to alert.
    for (const item of menu.filter(m => m.id !== 'menu_pbm' && m.sellingPrice > 0)) expect(marginDrift(costView(item, menu), materials, {})?.alert ?? null).toBeNull();
  });

  it('makes a true profit over the three weeks, after wastage, couriers and the month\'s overheads', () => {
    const f = financialsForRange({
      orders: kitchen.orders as never, menu, materials, experiments: kitchen.experiments, wastageLogs: kitchen.wastageLogs,
      settings: kitchen.settings, start: '2026-09-29', end: TODAY, today: TODAY,
    });
    expect(f.wastageExpenses).toBeGreaterThan(0);
    expect(f.deliveryExpenses).toBeGreaterThan(0);
    expect(f.fixedCosts).toBeGreaterThan(0);
    expect(f.trueProfit).toBeGreaterThan(0);
  });
});
