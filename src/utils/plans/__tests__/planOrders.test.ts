import { describe, it, expect } from 'vitest';
import { planOrderGroup, planHandOver, planMarkPaid } from '../planOrders';
import type { MenuItem, Order, RawMaterial } from '../../../types';

const flour: RawMaterial = { id: 'flour', name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05, category: 'Raw Materials', threshold: 100, dateAdded: '2026-01-01' };
const box: RawMaterial = { id: 'box', name: 'Box', unit: 'pcs', initialStock: 50, costPerUnit: 8, category: 'Packaging Materials', threshold: 5, dateAdded: '2026-01-01' };
const materials = [flour, box];
const cake: MenuItem = { id: 'cake', name: 'Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [{ materialId: 'flour', amount: 400, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }] } as MenuItem;
const cookie: MenuItem = { id: 'cookie', name: 'Cookie', sellingPrice: 50, finishedGoodsStock: 10, recipe: [{ materialId: 'flour', amount: 20, unit: 'g' }] } as MenuItem;
const menu = [cake, cookie];

/** Ids a, b, c, ... so a plan is deterministic. */
const ids = () => { let n = 0; return { newId: () => String.fromCharCode(97 + n++) }; };
const today = '2026-10-06';
const ok = <T extends { ok: boolean }>(p: T) => { expect(p.ok).toBe(true); return p as Extract<T, { ok: true }>; };
const fail = <T extends { ok: boolean }>(p: T) => { expect(p.ok).toBe(false); return (p as any).error; };

describe('planOrderGroup', () => {
  it('a single item from stock: one order, stamped, no group id, and the stock claimed', () => {
    const plan = ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 2 }], menu, materials, today, ctx: ids() }));
    expect(plan.preorder).toBe(false);
    expect(plan.writes).toHaveLength(2);
    const [order, stock] = plan.writes;
    expect(order).toMatchObject({ collection: 'orders', id: 'a', merge: false });
    expect(order.data).toMatchObject({
      id: 'a', menuItemId: 'cake', quantity: 2, date: today, bookedOn: today,
      unitPriceAtSale: 900, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 8, itemNameAtSale: 'Cake',
    });
    expect(order.data).not.toHaveProperty('orderGroupId');
    expect(order.data).not.toHaveProperty('paymentStatus'); // an order with no value counts as paid
    expect(stock).toEqual({ collection: 'menu', id: 'cake', data: { finishedGoodsStock: 3 }, merge: true });
  });

  it('several items share one group id, drawn before the order ids; a discount sits on the first item only; the address on all', () => {
    const plan = ok(planOrderGroup({
      common: { date: today, discount: 100, deliveryAddress: '12 MG Road', customerName: 'Priya', customerPhone: '9845010101' },
      lineItems: [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'cookie', quantity: 4 }], menu, materials, today, ctx: ids(),
    }));
    const [first, second] = plan.orders;
    expect(first.orderGroupId).toBe('a');
    expect(second.orderGroupId).toBe('a');
    expect([first.id, second.id]).toEqual(['b', 'c']);
    expect(first.discount).toBe(100);
    expect(second.discount).toBeUndefined();
    expect([first.deliveryAddress, second.deliveryAddress]).toEqual(['12 MG Road', '12 MG Road']);
    expect(first).toMatchObject({ customerName: 'Priya', customerPhone: '9845010101' });
  });

  it('refuses more than is in stock, counting the same item on two lines together', () => {
    const error = fail(planOrderGroup({
      common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 3 }, { menuItemId: 'cake', quantity: 3 }], menu, materials, today, ctx: ids(),
    }));
    expect(error).toMatchObject({
      code: 'insufficient_stock', title: 'Not Enough Stock',
      message: 'Only 5 unit(s) of "Cake" in stock, but this order needs 6. Log another production run to cover the rest.',
      thrown: 'addOrderGroup: insufficient stock for menuItemId "cake" (requested 6, available 5)',
    });
  });

  it('refuses an item that is not on the menu', () => {
    const error = fail(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'nope', quantity: 1 }], menu, materials, today, ctx: ids() }));
    expect(error.code).toBe('unknown_item');
    expect(error.message).toBe('One of the selected items could not be found. Please reselect it and try again.');
  });

  it('uses an agreed price in place of the menu price', () => {
    const plan = ok(planOrderGroup({ common: { date: today }, lineItems: [{ menuItemId: 'cake', quantity: 1, unitPrice: 750 }], menu, materials, today, ctx: ids() }));
    expect(plan.orders[0].unitPriceAtSale).toBe(750);
  });

  it('pays later: stores unpaid; pays now with a method: stores the method and its fee rate', () => {
    const later = ok(planOrderGroup({ common: { date: today, paymentStatus: 'unpaid' }, lineItems: [{ menuItemId: 'cookie', quantity: 1 }], menu, materials, today, ctx: ids() }));
    expect(later.orders[0].paymentStatus).toBe('unpaid');
    const now = ok(planOrderGroup({ common: { date: today, paymentMethod: 'upi' }, lineItems: [{ menuItemId: 'cookie', quantity: 1 }], menu, materials, feeRates: { upi: 0.5 }, today, ctx: ids() }));
    expect(now.orders[0]).toMatchObject({ paymentMethod: 'upi', paymentFeeRate: 0.5 });
  });

  describe('a pre-order', () => {
    const pre = (extra: Partial<Parameters<typeof planOrderGroup>[0]['common']> = {}, qty = 2) => planOrderGroup({
      common: { date: '2026-10-10', preorder: true, dueSlot: 'evening', notes: 'Eggless', ...extra },
      lineItems: [{ menuItemId: 'cake', quantity: qty }], menu, materials, feeRates: { upi: 0.5 }, today, ctx: ids(),
    });

    it('takes no stock and is not capped by it, and carries its slot and notes', () => {
      const plan = ok(pre({}, 50)); // far more than the 5 in stock
      expect(plan.preorder).toBe(true);
      expect(plan.writes.every(w => w.collection === 'orders')).toBe(true);
      expect(plan.orders[0]).toMatchObject({ preorder: true, stockClaimed: false, dueSlot: 'evening', notes: 'Eggless', date: '2026-10-10', bookedOn: today });
    });

    it('an advance that leaves a balance: the order stays unpaid and keeps the advance, its method, fee rate and date', () => {
      const plan = ok(pre({ advance: { amount: 500, method: 'upi' } }));
      expect(plan.orders[0].paymentStatus).toBe('unpaid');
      expect(plan.orders[0].advance).toEqual({ amount: 500, method: 'upi', feeRate: 0.5, date: today });
    });

    it('an advance that covers everything: paid, by the advance\'s own method', () => {
      const plan = ok(pre({ advance: { amount: 1800, method: 'upi' } })); // 2 x 900
      expect(plan.orders[0].paymentStatus).toBeUndefined();
      expect(plan.orders[0]).toMatchObject({ paymentMethod: 'upi', paymentFeeRate: 0.5 });
    });

    it('refuses an advance of nothing, and one larger than the order comes to', () => {
      expect(fail(pre({ advance: { amount: 0, method: 'upi' } })).message).toBe('The advance must be more than nothing.');
      expect(fail(pre({ advance: { amount: 2000, method: 'upi' } })).message).toBe('The advance (2000) is more than the order comes to (1800). Please check it and try again.');
    });

    it('counts GST and the discount when checking an advance', () => {
      const withGst = planOrderGroup({
        common: { date: '2026-10-10', preorder: true, discount: 100, advance: { amount: 1900, method: 'upi' } },
        lineItems: [{ menuItemId: 'cake', quantity: 2 }], menu, materials, today, ctx: ids(),
        gst: { gstApplicable: true, gstRate: 5, gstPricingMode: 'exclusive' },
      });
      // (1800 - 100) + 5% GST = 1785: an advance of 1900 is too much
      expect(fail(withGst).message).toContain('is more than the order comes to (1785)');
    });
  });
});

describe('planHandOver', () => {
  const order = (over: Partial<Order>): Order => ({ id: 'o1', menuItemId: 'cake', quantity: 2, date: '2026-10-10', ...over } as Order);

  it('an ordinary order is just marked handed over, with no stock effect', () => {
    const plan = planHandOver({ order: order({}), orders: [], menu, materials });
    expect(plan).toEqual({ kind: 'ok', atomic: false, writes: [{ collection: 'orders', id: 'o1', data: { fulfilled: true }, merge: true }] });
  });

  it('does nothing for an order already handed over', () => {
    expect(planHandOver({ order: order({ fulfilled: true }), orders: [], menu, materials })).toEqual({ kind: 'noop' });
  });

  it('a pre-order claims its stock, marks itself claimed and handed over, and re-stamps the costs but keeps the booked price', () => {
    const pre = order({ preorder: true, stockClaimed: false, unitPriceAtSale: 850, unitIngredientCostAtSale: 1 });
    const plan = planHandOver({ order: pre, orders: [pre], menu, materials });
    expect(plan.kind).toBe('ok');
    if (plan.kind !== 'ok') return;
    expect(plan.atomic).toBe(true);
    expect(plan.writes[0]).toEqual({ collection: 'orders', id: 'o1', merge: true, data: {
      stockClaimed: true, fulfilled: true, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 8, unitInputGstAtSale: 0,
    } });
    expect(plan.writes[0].data).not.toHaveProperty('unitPriceAtSale'); // the booked price stays
    expect(plan.writes[1]).toEqual({ collection: 'menu', id: 'cake', merge: true, data: { finishedGoodsStock: 3 } });
  });

  it('a multi-item pre-order is handed over whole or not at all', () => {
    const a = order({ id: 'a', preorder: true, orderGroupId: 'g', menuItemId: 'cake', quantity: 2 });
    const b = order({ id: 'b', preorder: true, orderGroupId: 'g', menuItemId: 'cookie', quantity: 50 }); // only 10 cookies
    const plan = planHandOver({ order: a, orders: [a, b], menu, materials });
    expect(plan).toMatchObject({ kind: 'error', code: 'insufficient_stock', title: 'Not Enough Stock',
      message: 'Only 10 unit(s) of "Cookie" in stock, but this pre-order needs 50. Log a production run first.' });
  });

  it('refuses a cancelled pre-order', () => {
    const pre = order({ preorder: true, cancelledOn: '2026-10-08' });
    expect(planHandOver({ order: pre, orders: [pre], menu, materials })).toMatchObject({ kind: 'error', code: 'cancelled', title: 'Cancelled' });
  });

  it('only the items not yet handed over are claimed', () => {
    const a = order({ id: 'a', preorder: true, orderGroupId: 'g', fulfilled: true, stockClaimed: true });
    const b = order({ id: 'b', preorder: true, orderGroupId: 'g', menuItemId: 'cookie', quantity: 4 });
    const plan = planHandOver({ order: b, orders: [a, b], menu, materials });
    if (plan.kind !== 'ok') throw new Error('expected ok');
    expect(plan.writes.map(w => `${w.collection}/${w.id}`)).toEqual(['orders/b', 'menu/cookie']);
  });
});

describe('planMarkPaid', () => {
  it('marks orders paid with the method and the fee rate in force', () => {
    expect(planMarkPaid({ ids: ['a', 'b'], paid: true, method: 'upi', feeRates: { upi: 0.5 } })).toEqual([
      { collection: 'orders', id: 'a', merge: true, data: { paymentStatus: 'paid', paymentMethod: 'upi', paymentFeeRate: 0.5 } },
      { collection: 'orders', id: 'b', merge: true, data: { paymentStatus: 'paid', paymentMethod: 'upi', paymentFeeRate: 0.5 } },
    ]);
  });
  it('marks unpaid again with no method, and paid without a method records none', () => {
    expect(planMarkPaid({ ids: ['a'], paid: false, method: 'upi' })[0].data).toEqual({ paymentStatus: 'unpaid' });
    expect(planMarkPaid({ ids: ['a'], paid: true })[0].data).toEqual({ paymentStatus: 'paid' });
  });
});
