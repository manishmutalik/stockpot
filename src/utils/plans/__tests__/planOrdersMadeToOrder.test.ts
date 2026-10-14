import { describe, it, expect } from 'vitest';
import { planHandOver, planOrderChange, planOrderGiveBack, planOrderGroup } from '../planOrders';
import type { MenuItem, Order, RawMaterial } from '../../../types';

const cream: RawMaterial = { id: 'cream', name: 'Whipping cream', unit: 'ml', initialStock: 1000, costPerUnit: 0.4, category: 'Raw Materials', threshold: 100, dateAdded: '2026-01-01' };
const pineapple: RawMaterial = { id: 'pine', name: 'Pineapple', unit: 'kg', initialStock: 1, costPerUnit: 120, category: 'Raw Materials', threshold: 0, dateAdded: '2026-01-01' };
const gel: RawMaterial = { id: 'gel', name: 'Cake gel', unit: 'g', initialStock: 5000, costPerUnit: 0.3, category: 'Raw Materials', threshold: 0, dateAdded: '2026-01-01' };
const materials = [cream, pineapple, gel];
const base: MenuItem = { id: 'base', name: 'Sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 3, recipe: [{ materialId: 'gel', amount: 220, unit: 'g' }] };
// A 1 kg cream cake, assembled when ordered on a base made ahead.
const cake: MenuItem = {
  id: 'cake', name: 'Pineapple cake 1 kg', sellingPrice: 900, madeToOrder: true,
  recipe: [{ materialId: 'cream', amount: 150, unit: 'ml' }, { materialId: 'pine', amount: 100, unit: 'g' }], parts: [{ itemId: 'base', quantity: 1 }],
};
const cookie: MenuItem = { id: 'cookie', name: 'Cookie', sellingPrice: 50, finishedGoodsStock: 10, recipe: [{ materialId: 'gel', amount: 20, unit: 'g' }] };
const menu = [base, cake, cookie];
const ids = () => { let n = 0; return { newId: () => String.fromCharCode(97 + n++) }; };
const today = '2026-10-14';
const ok = <T extends { ok: boolean }>(p: T) => { expect(p.ok).toBe(true); return p as Extract<T, { ok: true }>; };
const byPath = (writes: { collection: string; id: string; data: Record<string, unknown> }[]) => Object.fromEntries(writes.map(w => [`${w.collection}/${w.id}`, w.data]));

describe('made-to-order sales', () => {
  it('an order from stock takes the ingredients and the base, records them, and is never capped by a shelf', () => {
    const plan = ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 2 }, { menuItemId: 'cookie', quantity: 3 }], menu, materials, today, ctx: ids() }));
    const w = byPath(plan.writes);
    // 2 × 150 ml cream, 2 × 100 g pineapple (0.2 kg), 2 bases; the cookies come off their shelf.
    expect(w['materials/cream']).toEqual({ initialStock: 700 });
    expect(w['materials/pine']).toEqual({ initialStock: 0.8 });
    expect(w['menu/base']).toEqual({ finishedGoodsStock: 1 });
    expect(w['menu/cookie']).toEqual({ finishedGoodsStock: 7 });
    expect(w['menu/cake']).toBeUndefined();
    // What was taken is kept on the order, with what the ingredients cost (the base was paid for when it was baked).
    expect(plan.orders[0].taken).toEqual({ materials: [{ materialId: 'cream', amount: 300 }, { materialId: 'pine', amount: 0.2 }], parts: [{ itemId: 'base', quantity: 2 }], cost: 144 });
    expect(plan.orders[1].taken).toBeUndefined();
    // Still stamped as any order, parts included: 60 + 12 + a base's 66.
    expect(plan.orders[0].unitIngredientCostAtSale).toBe(138);
    expect(plan.shortages).toEqual([]);
  });

  it('goes below nothing when short, and says what', () => {
    const plan = ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 4 }], menu, materials, today, ctx: ids() }));
    expect(plan.shortages).toEqual([{ materialId: 'base', name: 'Sponge base', unit: 'pcs', short: 1 }]);
    expect(byPath(plan.writes)['menu/base']).toEqual({ finishedGoodsStock: -1 });
  });

  it('the same item on two lines takes for each, from what the first left', () => {
    const plan = ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'cake', quantity: 1 }], menu, materials, today, ctx: ids() }));
    expect(byPath(plan.writes)['materials/cream']).toEqual({ initialStock: 700 });
    expect(plan.writes.filter(w => w.collection === 'materials' && w.id === 'cream')).toHaveLength(1);
  });

  it('a pre-order takes nothing at booking, and takes the ingredients when handed over', () => {
    const booked = ok(planOrderGroup({ common: { date: '2026-10-20', preorder: true }, lineItems: [{ menuItemId: 'cake', quantity: 1 }], menu, materials, today, ctx: ids() }));
    expect(booked.writes.map(w => w.collection)).toEqual(['orders']);
    expect(booked.orders[0].taken).toBeUndefined();

    const handed = planHandOver({ order: booked.orders[0], orders: booked.orders, menu, materials });
    if (handed.kind !== 'ok') throw new Error('expected ok');
    const w = byPath(handed.writes);
    expect(w['orders/a']).toMatchObject({ fulfilled: true, stockClaimed: true, taken: { parts: [{ itemId: 'base', quantity: 1 }] } });
    expect(w['materials/cream']).toEqual({ initialStock: 850 });
    expect(w['menu/base']).toEqual({ finishedGoodsStock: 2 });
    expect(handed.shortages).toEqual([]);
  });

  it('a pre-order is handed over even with no base on the shelf, with a warning', () => {
    const order = { id: 'p', menuItemId: 'cake', quantity: 1, date: today, preorder: true, stockClaimed: false } as Order;
    const handed = planHandOver({ order, orders: [order], menu: [{ ...base, finishedGoodsStock: 0 }, cake], materials });
    expect(handed.kind === 'ok' && handed.shortages).toEqual([{ materialId: 'base', name: 'Sponge base', unit: 'pcs', short: 1 }]);
  });
});

describe('giving back and changing', () => {
  const sold = (): Order[] => ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 2 }, { menuItemId: 'cookie', quantity: 3 }], menu, materials, today, ctx: ids() })).orders;
  // The stock once that sale is saved: 700 ml cream, 0.8 kg pineapple, 1 base, 7 cookies.
  const after = () => ({
    materials: materials.map(m => (m.id === 'cream' ? { ...m, initialStock: 700 } : m.id === 'pine' ? { ...m, initialStock: 0.8 } : m)),
    menu: menu.map(m => (m.id === 'base' ? { ...m, finishedGoodsStock: 1 } : m.id === 'cookie' ? { ...m, finishedGoodsStock: 7 } : m)),
  });

  it('deleting gives back exactly what each order took, whatever the recipe says now', () => {
    const [cakeOrder, cookieOrder] = sold();
    const now = after();
    // The cake's recipe has changed since: what the order took is what goes back.
    const changed = now.menu.map(m => (m.id === 'cake' ? { ...m, recipe: [] } : m));
    const w = byPath(planOrderGiveBack({ orders: [cakeOrder, cookieOrder], menu: changed, materials: now.materials }));
    expect(w['materials/cream']).toEqual({ initialStock: 1000 });
    expect(w['materials/pine']).toEqual({ initialStock: 1 });
    expect(w['menu/base']).toEqual({ finishedGoodsStock: 3 });
    expect(w['menu/cookie']).toEqual({ finishedGoodsStock: 10 });
  });

  it('a pre-order not handed over, or a cancelled one, gives back nothing', () => {
    const pre = { id: 'p', menuItemId: 'cake', quantity: 1, date: today, preorder: true, stockClaimed: false } as Order;
    const cancelled = { id: 'c', menuItemId: 'cookie', quantity: 1, date: today, cancelledOn: today, preorder: true } as Order;
    expect(planOrderGiveBack({ orders: [pre, cancelled], menu, materials })).toEqual([]);
  });

  it('changing the quantity gives back and takes again', () => {
    const [cakeOrder] = sold();
    const plan = ok(planOrderChange({ order: cakeOrder, menuItemId: 'cake', quantity: 1, ...after() }));
    const w = byPath(plan.writes);
    // Stock as it was before the sale (1000 ml), less one cake.
    expect(w['materials/cream']).toEqual({ initialStock: 850 });
    expect(w['menu/base']).toEqual({ finishedGoodsStock: 2 });
    expect(w[`orders/${cakeOrder.id}`]).toMatchObject({ menuItemId: 'cake', quantity: 1, taken: { parts: [{ itemId: 'base', quantity: 1 }] } });
    expect(w[`orders/${cakeOrder.id}`]).not.toHaveProperty('unitPriceAtSale');
  });

  it('changing a made-to-order line to a shelf item gives the ingredients back and claims the shelf, capped', () => {
    const [cakeOrder] = sold();
    const plan = ok(planOrderChange({ order: cakeOrder, menuItemId: 'cookie', quantity: 4, ...after() }));
    const w = byPath(plan.writes);
    expect(w['materials/cream']).toEqual({ initialStock: 1000 });
    expect(w['menu/base']).toEqual({ finishedGoodsStock: 3 });
    expect(w['menu/cookie']).toEqual({ finishedGoodsStock: 3 });
    expect(w[`orders/${cakeOrder.id}`]).toMatchObject({ menuItemId: 'cookie', quantity: 4, taken: null, unitPriceAtSale: 50 });
    const tooMany = planOrderChange({ order: cakeOrder, menuItemId: 'cookie', quantity: 8, ...after() });
    expect(tooMany.ok === false && tooMany.error.message).toBe('Only 7 unit(s) of "Cookie" available.');
  });

  it('a shelf line changed to a made-to-order item puts its units back and takes the ingredients', () => {
    const [, cookieOrder] = sold();
    const plan = ok(planOrderChange({ order: cookieOrder, menuItemId: 'cake', quantity: 1, ...after() }));
    const w = byPath(plan.writes);
    expect(w['menu/cookie']).toEqual({ finishedGoodsStock: 10 });
    expect(w['materials/cream']).toEqual({ initialStock: 550 });
    expect(w[`orders/${cookieOrder.id}`]).toMatchObject({ menuItemId: 'cake', quantity: 1, unitPriceAtSale: 900 });
  });
});
