import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchDelete = vi.fn();
const batchCommit = vi.fn();
const setDoc = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, delete: batchDelete, commit: batchCommit })),
  setDoc: (...a: any[]) => setDoc(...a),
}));

import { useOrderActions } from '../useOrderActions';
import type { MenuItem, Order, RawMaterial } from '../../types';

const TODAY = '2026-10-04';
const DUE = '2026-10-06';
const showConfirm = vi.fn();
const flour: RawMaterial = { id: 'flour', name: 'Flour', unit: 'kg', initialStock: 50, costPerUnit: 40, category: 'Raw Materials', dateAdded: '2026-01-01' } as RawMaterial;

const menuOf = (stock: { cake?: number; cookie?: number } = {}): MenuItem[] => [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }], finishedGoodsStock: stock.cake ?? 0 } as MenuItem,
  { id: 'cookie', name: 'Butter Cookie', sellingPrice: 10, recipe: [], finishedGoodsStock: stock.cookie ?? 0 } as MenuItem,
];

const hook = (menu: MenuItem[], orders: Order[] = [], showAlert = vi.fn(), opts: Record<string, any> = {}) =>
  renderHook(() => useOrderActions(menu, orders, TODAY, showConfirm, showAlert, [flour], { upi: 2, cash: 0 }, { today: () => TODAY, ...opts })).result.current;

const writes = (kind: 'orders' | 'menu') => batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes(`/${kind}/`));
const stockWrite = (id: string) => writes('menu').find(([ref]: any[]) => ref.path.endsWith(`/menu/${id}`))?.[1]?.finishedGoodsStock;

let n = 0;
const order = (over: Partial<Order> = {}): Order => ({
  id: `o${++n}`, menuItemId: 'cake', quantity: 2, date: TODAY,
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake', ...over,
} as Order);
const preorder = (over: Partial<Order> = {}) => order({ preorder: true, stockClaimed: false, date: DUE, bookedOn: TODAY, ...over });

beforeEach(() => { vi.clearAllMocks(); });

// ── The stock-integrity rules come first: no path may add stock back for an order that never took it. ──

describe('deleteOrder never adds back stock an order did not take', () => {
  it('a pre-order not yet handed over gives nothing back', async () => {
    const p = preorder({ quantity: 3 });
    await hook(menuOf({ cake: 5 }), [p]).deleteOrder(p.id);
    expect(batchDelete).toHaveBeenCalledTimes(1);
    expect(writes('menu')).toHaveLength(0);
  });

  it('a pre-order that was handed over gives its stock back', async () => {
    const p = preorder({ quantity: 3, stockClaimed: true, fulfilled: true });
    await hook(menuOf({ cake: 5 }), [p]).deleteOrder(p.id);
    expect(stockWrite('cake')).toBe(8);
  });

  it('an ordinary order, old or new, gives its stock back as it always did', async () => {
    const legacy = order({ quantity: 4 });
    await hook(menuOf({ cake: 1 }), [legacy]).deleteOrder(legacy.id);
    expect(stockWrite('cake')).toBe(5);
  });

  it('a cancelled order gives nothing back, whichever kind it was', async () => {
    const cancelledStock = order({ quantity: 4, cancelledOn: TODAY });
    const cancelledPre = preorder({ quantity: 2, stockClaimed: true, cancelledOn: TODAY });
    const h = hook(menuOf({ cake: 1 }), [cancelledStock, cancelledPre]);
    await h.deleteOrder(cancelledStock.id);
    await h.deleteOrder(cancelledPre.id);
    expect(writes('menu')).toHaveLength(0);
  });
});

describe('updateOrder on an order that holds no stock', () => {
  it('changes the quantity of an unclaimed pre-order with no stock check and no stock write, even beyond what is on the shelf', async () => {
    const p = preorder({ quantity: 2 });
    const showAlert = vi.fn();
    await hook(menuOf({ cake: 0 }), [p], showAlert).updateOrder(p.id, 'quantity', 50);
    expect(showAlert).not.toHaveBeenCalled();
    expect(writes('menu')).toHaveLength(0);
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining(`/orders/${p.id}`) }), expect.objectContaining({ quantity: 50 }), { merge: true });
  });

  it('changes the item of an unclaimed pre-order, re-stamping it from the new item, with no stock write', async () => {
    const p = preorder({ quantity: 2 });
    await hook(menuOf({ cake: 5, cookie: 0 }), [p]).updateOrder(p.id, 'menuItemId', 'cookie');
    expect(writes('menu')).toHaveLength(0);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ menuItemId: 'cookie', unitPriceAtSale: 10, itemNameAtSale: 'Butter Cookie' });
  });

  it('still ignores a quantity below one', async () => {
    const p = preorder();
    await hook(menuOf(), [p]).updateOrder(p.id, 'quantity', 0);
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('treats a handed-over pre-order like an ordinary order: it holds stock, so the cap and the rebalancing apply', async () => {
    const p = preorder({ quantity: 2, stockClaimed: true, fulfilled: true });
    const showAlert = vi.fn();
    const h = hook(menuOf({ cake: 3 }), [p], showAlert);
    await h.updateOrder(p.id, 'quantity', 4); // 3 on the shelf + the 2 it holds = 5 available
    expect(stockWrite('cake')).toBe(1);
    batchSet.mockClear();
    await h.updateOrder(p.id, 'quantity', 9);
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.any(String));
    expect(writes('menu')).toHaveLength(0);
  });

  it('an ordinary order is unchanged: more than is available is refused, less releases stock', async () => {
    const o = order({ quantity: 2 });
    const showAlert = vi.fn();
    const h = hook(menuOf({ cake: 1 }), [o], showAlert);
    await h.updateOrder(o.id, 'quantity', 4);
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.any(String));
    await h.updateOrder(o.id, 'quantity', 1);
    expect(stockWrite('cake')).toBe(2);
  });

  it('a cancelled order holds nothing, so an edit moves no stock', async () => {
    const c = preorder({ quantity: 2, stockClaimed: true, cancelledOn: TODAY });
    await hook(menuOf({ cake: 0 }), [c]).updateOrder(c.id, 'quantity', 3);
    expect(writes('menu')).toHaveLength(0);
  });
});

describe('resetOrders gives back only what orders held', () => {
  it('adds up, per item, only the orders that held stock', async () => {
    const orders = [
      order({ quantity: 2, date: TODAY }),                                                     // held: 2 cakes
      preorder({ quantity: 5, date: TODAY }),                                                  // never held
      preorder({ quantity: 3, date: TODAY, stockClaimed: true, fulfilled: true }),             // held: 3 cakes
      order({ quantity: 4, date: TODAY, cancelledOn: TODAY }),                                 // cancelled
      order({ quantity: 1, date: TODAY, menuItemId: 'cookie', itemNameAtSale: 'Butter Cookie' }), // held: 1 cookie
      order({ quantity: 9, date: '2026-10-03' }),                                              // another day
    ];
    const h = hook(menuOf({ cake: 10, cookie: 10 }), orders);
    h.resetOrders();
    await showConfirm.mock.calls[0][2]();
    expect(batchDelete).toHaveBeenCalledTimes(5);
    expect(stockWrite('cake')).toBe(15);
    expect(stockWrite('cookie')).toBe(11);
  });

  it('writes no stock at all when nothing held any', async () => {
    const h = hook(menuOf({ cake: 10 }), [preorder({ date: TODAY })]);
    h.resetOrders();
    await showConfirm.mock.calls[0][2]();
    expect(batchDelete).toHaveBeenCalledTimes(1);
    expect(writes('menu')).toHaveLength(0);
  });
});

// ── Booking ──

describe('addOrderGroup as a pre-order', () => {
  it('saves with nothing baked, leaves stock alone, and tells the owner it is not baked yet', async () => {
    const showAlert = vi.fn();
    await hook(menuOf({ cake: 0 }), [], showAlert).addOrderGroup(
      { date: DUE, preorder: true, dueSlot: 'morning', notes: 'Happy birthday Asha', customerName: 'Priya' },
      [{ menuItemId: 'cake', quantity: 2 }]
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(writes('menu')).toHaveLength(0);
    expect(writes('orders')[0][1]).toMatchObject({
      menuItemId: 'cake', quantity: 2, date: DUE, preorder: true, stockClaimed: false, bookedOn: TODAY, dueSlot: 'morning', notes: 'Happy birthday Asha',
    });
    expect(showAlert).toHaveBeenCalledWith('Pre-order Added', expect.stringContaining('Not baked yet'));
    expect(showAlert.mock.calls[0][1]).toContain('2 Chocolate Cake');
    expect(showAlert.mock.calls[0][1]).toContain('Tue 6 Oct');
  });

  it('does not say "not baked yet" for an item that is on the shelf, and still takes nothing from it', async () => {
    const showAlert = vi.fn();
    await hook(menuOf({ cake: 10 }), [], showAlert).addOrderGroup({ date: DUE, preorder: true }, [{ menuItemId: 'cake', quantity: 2 }]);
    expect(showAlert.mock.calls[0][1]).not.toContain('Not baked yet');
    expect(writes('menu')).toHaveLength(0);
  });

  it('shares the slot and notes across every item of a multi-item order', async () => {
    await hook(menuOf(), []).addOrderGroup(
      { date: DUE, preorder: true, dueSlot: '16:30', notes: 'eggless' },
      [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'cookie', quantity: 6 }]
    );
    const o = writes('orders').map(([, p]: any[]) => p);
    expect(o).toHaveLength(2);
    for (const p of o) expect(p).toMatchObject({ preorder: true, stockClaimed: false, dueSlot: '16:30', notes: 'eggless', bookedOn: TODAY });
    expect(o[0].orderGroupId).toBe(o[1].orderGroupId);
  });

  it('leaves out slot and notes when not given', async () => {
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true }, [{ menuItemId: 'cake', quantity: 1 }]);
    const p = writes('orders')[0][1];
    expect(p).not.toHaveProperty('dueSlot');
    expect(p).not.toHaveProperty('notes');
    expect(p).not.toHaveProperty('advance');
  });

  it('stores the advance once, on the first item only, with the fee rate and date of today', async () => {
    await hook(menuOf(), []).addOrderGroup(
      { date: DUE, preorder: true, advance: { amount: 50, method: 'upi' } },
      [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'cookie', quantity: 5 }]
    );
    const o = writes('orders').map(([, p]: any[]) => p);
    expect(o[0].advance).toEqual({ amount: 50, method: 'upi', feeRate: 2, date: TODAY });
    expect(o[1]).not.toHaveProperty('advance');
  });

  it('is unpaid while a balance remains, on every item', async () => {
    await hook(menuOf(), []).addOrderGroup(
      { date: DUE, preorder: true, paymentStatus: 'paid', advance: { amount: 50, method: 'cash' } },
      [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'cookie', quantity: 5 }]
    );
    for (const [, p] of writes('orders')) expect(p.paymentStatus).toBe('unpaid');
  });

  it('is paid, recorded against the advance\'s method, when the advance covers the whole total', async () => {
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true, advance: { amount: 200, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 2 }]);
    const p = writes('orders')[0][1];
    expect(p).not.toHaveProperty('paymentStatus');
    expect(p).toMatchObject({ paymentMethod: 'upi', paymentFeeRate: 2 });
  });

  it('works the total out with GST when it is on, so an advance only covers it when it covers the tax too', async () => {
    const gst = { gstApplicable: true, gstRate: 10, gstPricingMode: 'exclusive' as const };
    await hook(menuOf(), [], vi.fn(), { gst }).addOrderGroup({ date: DUE, preorder: true, advance: { amount: 200, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 2 }]);
    expect(writes('orders')[0][1].paymentStatus).toBe('unpaid'); // 200 + 10% GST = 220 is owed
    batchSet.mockClear();
    await hook(menuOf(), [], vi.fn(), { gst }).addOrderGroup({ date: DUE, preorder: true, advance: { amount: 220, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 2 }]);
    expect(writes('orders')[0][1]).not.toHaveProperty('paymentStatus');
  });

  it('takes a discount off before comparing the advance with the total', async () => {
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true, discount: 50, advance: { amount: 150, method: 'cash' } }, [{ menuItemId: 'cake', quantity: 2 }]);
    expect(writes('orders')[0][1]).not.toHaveProperty('paymentStatus');
  });

  it('refuses an advance larger than the order, before writing anything', async () => {
    const showAlert = vi.fn();
    await expect(hook(menuOf(), [], showAlert).addOrderGroup({ date: DUE, preorder: true, advance: { amount: 500, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 1 }])).rejects.toThrow();
    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error', expect.stringMatching(/advance/i));
  });

  it('refuses an advance of nothing or less', async () => {
    for (const amount of [0, -5, NaN]) {
      await expect(hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true, advance: { amount, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 1 }])).rejects.toThrow();
    }
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('keeps the user\'s own payment choice when there is no advance', async () => {
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true, paymentStatus: 'unpaid' }, [{ menuItemId: 'cake', quantity: 1 }]);
    expect(writes('orders')[0][1].paymentStatus).toBe('unpaid');
  });
});

describe('addOrderGroup from stock keeps its hard cap', () => {
  it('still refuses more than is on the shelf, and writes nothing', async () => {
    const showAlert = vi.fn();
    await expect(hook(menuOf({ cake: 1 }), [], showAlert).addOrderGroup({ date: TODAY }, [{ menuItemId: 'cake', quantity: 2 }])).rejects.toThrow();
    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.any(String));
  });

  it('claims stock, marks when it was booked, and is not a pre-order', async () => {
    await hook(menuOf({ cake: 5 }), []).addOrderGroup({ date: TODAY }, [{ menuItemId: 'cake', quantity: 2 }]);
    expect(stockWrite('cake')).toBe(3);
    const p = writes('orders')[0][1];
    expect(p.bookedOn).toBe(TODAY);
    expect(p).not.toHaveProperty('preorder');
    expect(p).not.toHaveProperty('stockClaimed');
  });

  it('ignores an advance, which only a pre-order can hold', async () => {
    await hook(menuOf({ cake: 5 }), []).addOrderGroup({ date: TODAY, advance: { amount: 50, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 1 }]);
    expect(writes('orders')[0][1]).not.toHaveProperty('advance');
  });
});

describe('a custom price on an order line', () => {
  it('lands in unitPriceAtSale, in both modes, while the costs are still stamped from the menu', async () => {
    await hook(menuOf({ cake: 5 }), []).addOrderGroup({ date: TODAY }, [{ menuItemId: 'cake', quantity: 1, unitPrice: 650 }]);
    expect(writes('orders')[0][1]).toMatchObject({ unitPriceAtSale: 650, unitIngredientCostAtSale: 20 });
    batchSet.mockClear();
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true }, [{ menuItemId: 'cake', quantity: 1, unitPrice: 425.5 }]);
    expect(writes('orders')[0][1]).toMatchObject({ unitPriceAtSale: 425.5 });
  });

  it('uses the menu price when none, or a nonsense one, is given', async () => {
    await hook(menuOf({ cake: 5 }), []).addOrderGroup({ date: TODAY }, [{ menuItemId: 'cake', quantity: 1 }]);
    expect(writes('orders')[0][1].unitPriceAtSale).toBe(100);
  });

  it('prices each line on its own', async () => {
    await hook(menuOf({ cake: 5, cookie: 5 }), []).addOrderGroup({ date: TODAY }, [{ menuItemId: 'cake', quantity: 1, unitPrice: 300 }, { menuItemId: 'cookie', quantity: 2 }]);
    const o = writes('orders').map(([, p]: any[]) => p);
    expect(o.map((p: any) => p.unitPriceAtSale)).toEqual([300, 10]);
  });

  it('counts the custom price in the advance comparison', async () => {
    await hook(menuOf(), []).addOrderGroup({ date: DUE, preorder: true, advance: { amount: 650, method: 'upi' } }, [{ menuItemId: 'cake', quantity: 1, unitPrice: 650 }]);
    expect(writes('orders')[0][1]).not.toHaveProperty('paymentStatus');
  });
});

// ── Handover ──

describe('fulfillOrder for a pre-order', () => {
  it('claims the stock under the same hard cap, and marks it claimed and handed over', async () => {
    const p = preorder({ quantity: 3 });
    const ok = await hook(menuOf({ cake: 5 }), [p]).fulfillOrder(p);
    expect(ok).toBe(true);
    expect(stockWrite('cake')).toBe(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(writes('orders')[0][1]).toMatchObject({ stockClaimed: true, fulfilled: true });
  });

  it('is blocked, with a clear message and nothing written, when stock is short', async () => {
    const p = preorder({ quantity: 3 });
    const showAlert = vi.fn();
    const ok = await hook(menuOf({ cake: 1 }), [p], showAlert).fulfillOrder(p);
    expect(ok).toBe(false);
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.stringMatching(/Only 1 unit\(s\) of "Chocolate Cake" in stock.*production run/));
    expect(batchCommit).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
  });

  it('hands over exactly what is on the shelf', async () => {
    const p = preorder({ quantity: 3 });
    expect(await hook(menuOf({ cake: 3 }), [p]).fulfillOrder(p)).toBe(true);
    expect(stockWrite('cake')).toBe(0);
  });

  it('re-stamps the costs now, because that is when it was made, and keeps the booked price and name', async () => {
    const p = preorder({ quantity: 1, unitPriceAtSale: 650, unitIngredientCostAtSale: 5, itemNameAtSale: 'Custom Cake' });
    await hook(menuOf({ cake: 2 }), [p]).fulfillOrder(p);
    const written = writes('orders')[0][1];
    expect(written.unitIngredientCostAtSale).toBe(20); // 0.5 kg of flour at 40
    expect(written).not.toHaveProperty('unitPriceAtSale');
    expect(written).not.toHaveProperty('itemNameAtSale');
  });

  it('is all or nothing for a multi-item pre-order: one item short blocks the whole order', async () => {
    const group = 'g1';
    const a = preorder({ orderGroupId: group, quantity: 2 });
    const b = preorder({ orderGroupId: group, menuItemId: 'cookie', quantity: 6, itemNameAtSale: 'Butter Cookie' });
    const showAlert = vi.fn();
    const ok = await hook(menuOf({ cake: 5, cookie: 2 }), [a, b], showAlert).fulfillOrder(a);
    expect(ok).toBe(false);
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.stringContaining('Butter Cookie'));
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('hands over every item of a multi-item pre-order together, taking each item\'s stock once', async () => {
    const group = 'g1';
    const a = preorder({ orderGroupId: group, quantity: 2 });
    const b = preorder({ orderGroupId: group, quantity: 1 }); // the same item on a second line
    const c = preorder({ orderGroupId: group, menuItemId: 'cookie', quantity: 6, itemNameAtSale: 'Butter Cookie' });
    expect(await hook(menuOf({ cake: 5, cookie: 6 }), [a, b, c]).fulfillOrder(b)).toBe(true);
    expect(writes('orders')).toHaveLength(3);
    for (const [, p] of writes('orders')) expect(p).toMatchObject({ stockClaimed: true, fulfilled: true });
    expect(stockWrite('cake')).toBe(2);
    expect(stockWrite('cookie')).toBe(0);
    expect(writes('menu')).toHaveLength(2);
  });

  it('checks the combined quantity of an item written on two lines, not each line alone', async () => {
    const group = 'g1';
    const a = preorder({ orderGroupId: group, quantity: 2 });
    const b = preorder({ orderGroupId: group, quantity: 2 });
    expect(await hook(menuOf({ cake: 3 }), [a, b]).fulfillOrder(a)).toBe(false);
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('does nothing for an order already handed over, and refuses a cancelled one', async () => {
    const done = preorder({ stockClaimed: true, fulfilled: true });
    const gone = preorder({ cancelledOn: TODAY });
    const showAlert = vi.fn();
    const h = hook(menuOf({ cake: 5 }), [done, gone], showAlert);
    expect(await h.fulfillOrder(done)).toBe(false);
    expect(await h.fulfillOrder(gone)).toBe(false);
    expect(batchCommit).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('leaves an ordinary order\'s completion exactly as it was: a flag, no stock', async () => {
    const o = order();
    await hook(menuOf({ cake: 0 }), [o]).fulfillOrder(o);
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining(`/orders/${o.id}`) }), { fulfilled: true }, { merge: true });
    expect(batchCommit).not.toHaveBeenCalled();
  });
});

// ── Cancellation ──

describe('cancelPreorder', () => {
  it('marks every item cancelled today and moves no stock', async () => {
    const a = preorder({ orderGroupId: 'g', quantity: 2 });
    const b = preorder({ orderGroupId: 'g', menuItemId: 'cookie', quantity: 4 });
    expect(await hook(menuOf({ cake: 3 }), [a, b]).cancelPreorder(a)).toBe(true);
    expect(writes('orders')).toHaveLength(2);
    for (const [, p] of writes('orders')) expect(p).toMatchObject({ cancelledOn: TODAY });
    expect(writes('menu')).toHaveLength(0);
  });

  it('records what happened to the advance on the item that holds it, and requires an answer', async () => {
    const a = preorder({ orderGroupId: 'g', advance: { amount: 100, method: 'upi', feeRate: 2, date: TODAY } });
    const b = preorder({ orderGroupId: 'g' });
    const showAlert = vi.fn();
    const h = hook(menuOf(), [a, b], showAlert);
    expect(await h.cancelPreorder(a)).toBe(false); // an advance was paid: refunded or kept?
    expect(batchCommit).not.toHaveBeenCalled();
    expect(await h.cancelPreorder(a, 'kept')).toBe(true);
    const byId = new Map(writes('orders').map(([ref, p]: any[]) => [ref.path.split('/').pop(), p]));
    expect(byId.get(a.id)).toMatchObject({ cancelledOn: TODAY, advanceOutcome: 'kept' });
    expect(byId.get(b.id)).not.toHaveProperty('advanceOutcome');
  });

  it('needs no answer when there is no advance', async () => {
    const p = preorder();
    expect(await hook(menuOf(), [p]).cancelPreorder(p)).toBe(true);
    expect(writes('orders')[0][1]).not.toHaveProperty('advanceOutcome');
  });

  it('refuses an order already handed over, one already cancelled, and an ordinary order', async () => {
    const done = preorder({ stockClaimed: true, fulfilled: true });
    const gone = preorder({ cancelledOn: TODAY });
    const plain = order();
    const showAlert = vi.fn();
    const h = hook(menuOf(), [done, gone, plain], showAlert);
    expect(await h.cancelPreorder(done)).toBe(false);
    expect(await h.cancelPreorder(gone)).toBe(false);
    expect(await h.cancelPreorder(plain)).toBe(false);
    expect(batchCommit).not.toHaveBeenCalled();
  });
});
