import { describe, it, expect, vi } from 'vitest';
import { createQuickHandOverHandler, createQuickPaymentHandler } from '../quickRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // 10:00 on 6 Oct in India
const UID = 'u1';
const KEY = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world(over: { bills?: any } = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata', paymentFeeRates: { upi: 0.5, cash: 0 } });
  mem.seed(UID, 'materials', 'flour', { name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05, category: 'Raw Materials' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [{ materialId: 'flour', amount: 400, unit: 'g' }] });
  mem.seed(UID, 'menu', 'sourdough', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 1, recipe: [{ materialId: 'flour', amount: 50, unit: 'g' }] });
  const bills = over.bills ?? vi.fn(async () => ({ token: 'f'.repeat(32) }));
  const deps = { db: mem.db, now: () => NOW, newId: () => 'x', bills, publicUrl: 'https://stockpot.example/' };
  return { mem, deps, bills };
}

const order = (id: string, over: Record<string, any> = {}) => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-10-01', unitPriceAtSale: 900, itemNameAtSale: 'Chocolate Truffle Cake', ...over });
const call = async (handler: any, body: unknown, over: { key?: string | null; params?: any } = {}) => {
  const r = res();
  const headers: Record<string, string> = {};
  if (over.key !== null) headers['idempotency-key'] = over.key ?? KEY;
  await handler({ uid: UID, headers, body, params: over.params ?? {} }, r);
  return r;
};

describe('POST /mobile/orders/:id/hand-over', () => {
  const preorder = (over: Record<string, any> = {}) => order('p1', {
    preorder: true, stockClaimed: false, date: '2026-10-10', quantity: 2, customerName: 'Priya Sharma', paymentStatus: 'unpaid',
    advance: { amount: 500, method: 'upi', feeRate: 0.5, date: '2026-10-02' }, ...over,
  });
  const handOver = (deps: any, id: string, body: unknown = {}, key?: string) => call(createQuickHandOverHandler(deps), body, { params: { id }, key });

  it('hands a pre-order over: stock claimed, costs re-stamped, and the balance (the total less the advance) reported', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', preorder());
    const r = await handOver(deps, 'p1');
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ handedOver: true, orderIds: ['p1'], balanceDue: 1300, balanceReceived: 0 });
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ fulfilled: true, stockClaimed: true, unitPriceAtSale: 900, paymentStatus: 'unpaid' });
    expect(mem.read(UID, 'orders', 'p1')!.unitIngredientCostAtSale).toBeCloseTo(20);
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(3);
  });

  it('with the balance received: the order is marked paid by that method and its fee rate, in the same save', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', preorder());
    const r = await handOver(deps, 'p1', { balanceReceived: { method: 'upi' } });
    expect(r.body).toMatchObject({ handedOver: true, balanceDue: 1300, balanceReceived: 1300, method: 'upi' });
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ fulfilled: true, paymentStatus: 'paid', paymentMethod: 'upi', paymentFeeRate: 0.5 });
    expect(mem.read(UID, 'orders', 'p1')!.advance).toEqual({ amount: 500, method: 'upi', feeRate: 0.5, date: '2026-10-02' }); // the advance is kept
  });

  it('answers with a link to the bill, made after the save', async () => {
    const { mem, deps, bills } = world();
    mem.seed(UID, 'orders', 'p1', preorder());
    const r = await handOver(deps, 'p1');
    expect(r.body.billUrl).toBe(`https://stockpot.example/bill/${'f'.repeat(32)}`);
    expect(bills).toHaveBeenCalledWith(UID, 'p1');
  });

  it('still hands over when the bill link cannot be made', async () => {
    const { mem, deps } = world({ bills: vi.fn(async () => { throw new Error('bills down'); }) });
    mem.seed(UID, 'orders', 'p1', preorder());
    const r = await handOver(deps, 'p1');
    expect(r.code).toBe(200);
    expect(r.body.handedOver).toBe(true);
    expect(r.body.billUrl).toBeUndefined();
  });

  it('refuses when the stock is short now, all or nothing, and saves nothing', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 1, recipe: [] });
    mem.seed(UID, 'orders', 'p1', preorder());
    const r = await handOver(deps, 'p1');
    expect(r.code).toBe(409);
    expect(r.body).toMatchObject({ code: 'insufficient_stock', error: 'Only 1 unit(s) of "Chocolate Truffle Cake" in stock, but this pre-order needs 2. Log a production run first.' });
    expect(mem.read(UID, 'orders', 'p1')!.fulfilled).toBeUndefined();
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(1);
  });

  it('refuses a cancelled pre-order', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', preorder({ cancelledOn: '2026-10-05' }));
    const r = await handOver(deps, 'p1');
    expect(r.code).toBe(409);
    expect(r.body.code).toBe('cancelled');
  });

  it('a multi-item order is handed over whole from any one item', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', preorder({ id: 'a', orderGroupId: 'g', advance: undefined, paymentStatus: undefined, quantity: 1 }));
    mem.seed(UID, 'orders', 'b', preorder({ id: 'b', orderGroupId: 'g', menuItemId: 'sourdough', unitPriceAtSale: 200, advance: undefined, paymentStatus: undefined, quantity: 1 }));
    const r = await handOver(deps, 'b');
    expect(r.body.orderIds.sort()).toEqual(['a', 'b']);
    expect(mem.read(UID, 'orders', 'a')!.fulfilled).toBe(true);
    expect(mem.read(UID, 'orders', 'b')!.fulfilled).toBe(true);
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(4);
    expect(mem.read(UID, 'menu', 'sourdough')!.finishedGoodsStock).toBe(0);
  });

  it('an order already handed over is not an error, and changes nothing', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'o1', order('o1', { fulfilled: true }));
    const r = await handOver(deps, 'o1');
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ handedOver: false, reason: 'already_handed_over' });
  });

  it('an ordinary order that is already paid owes nothing, so a method given records nothing', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'o1', order('o1', { paymentMethod: 'cash' }));
    const r = await handOver(deps, 'o1', { balanceReceived: { method: 'upi' } });
    expect(r.body).toMatchObject({ handedOver: true, balanceDue: 0, balanceReceived: 0 });
    expect(mem.read(UID, 'orders', 'o1')).toMatchObject({ fulfilled: true, paymentMethod: 'cash' });
  });

  it('an unknown order is a 404 and a malformed id a 400', async () => {
    const { deps } = world();
    expect((await handOver(deps, 'nope')).code).toBe(404);
    expect((await handOver(deps, '../etc')).code).toBe(400);
  });

  it('refuses a balanceReceived without a valid method', async () => {
    const { deps } = world();
    expect((await handOver(deps, 'p1', { balanceReceived: { method: 'gold' } })).code).toBe(400);
    expect((await handOver(deps, 'p1', { balanceReceived: {} })).code).toBe(400);
  });

  it('a repeat returns the first answer (and the bill link again) and does not claim stock twice', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', preorder());
    await handOver(deps, 'p1');
    const again = await handOver(deps, 'p1');
    expect(again.headers['Idempotent-Replayed']).toBe('true');
    expect(again.body).toMatchObject({ handedOver: true, billUrl: expect.stringContaining('/bill/') });
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(3);
  });

  it('cannot reach another owner\'s order', async () => {
    const { mem, deps } = world();
    mem.seed('someone-else', 'orders', 'p1', preorder());
    expect((await handOver(deps, 'p1')).code).toBe(404);
  });
});

describe('POST /mobile/payments', () => {
  const pay = (deps: any, body: unknown, key?: string) => call(createQuickPaymentHandler(deps), body, { key });
  /** Priya owes ₹900 (oldest) and ₹400; Rohan owes ₹900; Kavya has only a pre-order due later. */
  const seed = (mem: ReturnType<typeof memoryQuickDb>) => {
    mem.seed(UID, 'orders', 'o1', order('o1', { customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', paymentStatus: 'unpaid', date: '2026-10-01' }));
    mem.seed(UID, 'orders', 'o2', order('o2', { customerName: 'Priya Sharma', customerPhone: '98450-10101', paymentStatus: 'unpaid', date: '2026-10-03', menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200, itemNameAtSale: 'Sourdough' }));
    mem.seed(UID, 'orders', 'o3', order('o3', { customerName: 'Rohan Mehta', paymentStatus: 'unpaid', date: '2026-10-02' }));
    mem.seed(UID, 'orders', 'o4', order('o4', { customerName: 'Kavya Menon', paymentStatus: 'unpaid', preorder: true, date: '2026-10-20' }));
  };
  const PRIYA = 'phone:9845010101';

  it('pays the oldest whole order when the amount is exactly what it is owed', async () => {
    const { mem, deps } = world(); seed(mem);
    const r = await pay(deps, { customerKey: PRIYA, amount: 900, method: 'upi' });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ customerName: 'Priya Sharma', amount: 900, orderIds: ['o1'], remainingDue: 400 });
    expect(mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'upi', paymentFeeRate: 0.5 });
    expect(mem.read(UID, 'orders', 'o2')!.paymentStatus).toBe('unpaid');
  });

  it('pays several orders, oldest first, when the amount is their sum', async () => {
    const { mem, deps } = world(); seed(mem);
    const r = await pay(deps, { customerKey: PRIYA, amount: 1300, method: 'cash' });
    expect(r.body).toMatchObject({ orderIds: ['o1', 'o2'], remainingDue: 0 });
    expect(mem.read(UID, 'orders', 'o2')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash', paymentFeeRate: 0 });
    expect(mem.read(UID, 'orders', 'o3')!.paymentStatus).toBe('unpaid'); // someone else's
  });

  it('asks instead of guessing when the amount does not cover a whole order, and saves nothing', async () => {
    const { mem, deps } = world(); seed(mem);
    const r = await pay(deps, { customerKey: PRIYA, amount: 700, method: 'upi' });
    expect(r.code).toBe(422);
    expect(r.body).toMatchObject({
      code: 'amount_mismatch', customerName: 'Priya Sharma', owed: 1300, orderCount: 2, oldestOrderDue: 900,
      error: "Priya Sharma owes ₹1,300.00 for 2 orders. ₹700.00 doesn't cover a whole order (the oldest is ₹900.00).",
    });
    expect(r.body.amountsThatWork).toEqual([900, 1300]);
    expect(mem.read(UID, 'orders', 'o1')!.paymentStatus).toBe('unpaid');
  });

  it('says so when the amount is more than is owed', async () => {
    const { mem, deps } = world(); seed(mem);
    const r = await pay(deps, { customerKey: PRIYA, amount: 2000, method: 'upi' });
    expect(r.code).toBe(422);
    expect(r.body.error).toBe('Priya Sharma owes ₹1,300.00 for 2 orders. ₹2,000.00 is more than that.');
  });

  it('a pre-order\'s advance is taken off what is owed', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order('p1', { customerName: 'Anil', preorder: true, quantity: 2, date: '2026-10-06', paymentStatus: 'unpaid', advance: { amount: 500, method: 'upi', feeRate: 0.5, date: '2026-10-02' } }));
    const wrong = await pay(deps, { customerKey: 'name:anil', amount: 1800, method: 'upi' });
    expect(wrong.code).toBe(422); // 1800 is the total, 1300 is what is owed
    const right = await pay(deps, { customerKey: 'name:anil', amount: 1300, method: 'upi' });
    expect(right.code).toBe(200);
    expect(mem.read(UID, 'orders', 'p1')!.paymentStatus).toBe('paid');
  });

  it('a pre-order due later is not owed yet, so nothing is pending for its customer', async () => {
    const { mem, deps } = world(); seed(mem);
    const r = await pay(deps, { customerKey: 'name:kavya menon', amount: 900, method: 'upi' });
    expect(r.code).toBe(404);
    expect(r.body.code).toBe('no_pending');
  });

  it('an unknown customer is a 404', async () => {
    const { mem, deps } = world(); seed(mem);
    expect((await pay(deps, { customerKey: 'name:nobody', amount: 10, method: 'upi' })).code).toBe(404);
  });

  it('a repeat of the same payment does not pay a second order', async () => {
    const { mem, deps } = world(); seed(mem);
    await pay(deps, { customerKey: PRIYA, amount: 900, method: 'upi' });
    const again = await pay(deps, { customerKey: PRIYA, amount: 900, method: 'upi' });
    expect(again.headers['Idempotent-Replayed']).toBe('true');
    expect(mem.read(UID, 'orders', 'o2')!.paymentStatus).toBe('unpaid');
  });

  it('refuses a bad request', async () => {
    const { deps } = world();
    expect((await pay(deps, { customerKey: '', amount: 10, method: 'upi' })).code).toBe(400);
    expect((await pay(deps, { customerKey: PRIYA, amount: 0, method: 'upi' })).code).toBe(400);
    expect((await pay(deps, { customerKey: PRIYA, amount: 10, method: 'gold' })).code).toBe(400);
  });
});
