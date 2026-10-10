import { describe, it, expect, vi } from 'vitest';
import { createQuickClaimHandler, createQuickPaymentSetupHandler, createQuickPaymentsDueHandler, createQuickTodayHandler } from '../quickRoutes';
import { onlinePaymentsOf } from '../gatewayRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // Tue 6 Oct in India
const UID = 'u1';
const CLAIM = { at: NOW - 3_600_000, amount: 900, method: 'upi' };

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world(settings: Record<string, unknown> = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata', upiId: 'anita@upi', paymentFeeRates: { upi: 0.5 }, ...settings });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  mem.seed(UID, 'menu', 'bread', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 5, recipe: [] });
  const deps: any = { db: mem.db, now: () => NOW, newId: () => 'x' };
  return { mem, deps };
}

const order = (over: Record<string, any>) => ({ menuItemId: 'cake', quantity: 1, date: '2026-10-01', unitPriceAtSale: 900, paymentStatus: 'unpaid', customerName: 'Priya', customerPhone: '98765 43210', ...over });
const call = async (handler: any, req: Record<string, any>) => { const r = res(); await handler({ uid: UID, headers: {}, query: {}, ...req }, r); return r; };
let n = 0;
const review = (deps: any, body: unknown) => call(createQuickClaimHandler(deps), { body, headers: { 'idempotency-key': `claim-key-${String(++n).padStart(8, '0')}` } });

describe('a customer\'s "I have paid by UPI" in Payments due and Today', () => {
  it('shows who says they have paid, for how much and when, and marks the orders it covers', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ paymentClaim: CLAIM }));
    mem.seed(UID, 'orders', 'p2', order({ menuItemId: 'bread', quantity: 2, unitPriceAtSale: 200, date: '2026-10-03' }));
    mem.seed(UID, 'orders', 'r1', order({ customerName: 'Rohan', customerPhone: undefined, paymentClaim: null }));
    const r = await call(createQuickPaymentsDueHandler(deps), {});
    const priya = r.body.customers.find((c: any) => c.name === 'Priya');
    expect(priya.claim).toEqual({ at: CLAIM.at, amount: 900, orderCount: 1 });
    expect(priya.orders.map((o: any) => [o.orderId, o.claimed ?? false])).toEqual([['p1', true], ['p2', false]]);
    expect(r.body.customers.find((c: any) => c.name === 'Rohan').claim).toBeUndefined();
    const today = await call(createQuickTodayHandler(deps), {});
    expect(today.body.pendingPayments.top.find((c: any) => c.name === 'Priya').claim).toMatchObject({ amount: 900 });
  });

  it('counts each tap once: a statement claim is on every order it covered', async () => {
    const { mem, deps } = world();
    const tap = { at: NOW - 1000, amount: 1300, method: 'upi' };
    mem.seed(UID, 'orders', 'p1', order({ paymentClaim: tap }));
    mem.seed(UID, 'orders', 'p2', order({ menuItemId: 'bread', quantity: 2, unitPriceAtSale: 200, date: '2026-10-03', paymentClaim: tap }));
    const r = await call(createQuickPaymentsDueHandler(deps), {});
    expect(r.body.customers[0].claim).toEqual({ at: tap.at, amount: 1300, orderCount: 2 });
  });
});

describe('POST /mobile/payments/claim', () => {
  it('confirm marks the orders the customer said they paid for as paid by UPI, with the UPI fee, and clears the claim', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ paymentClaim: CLAIM }));
    mem.seed(UID, 'orders', 'p2', order({ menuItemId: 'bread', quantity: 2, unitPriceAtSale: 200, date: '2026-10-03' }));
    const r = await review(deps, { customerKey: 'phone:9876543210', action: 'confirm' });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ customerName: 'Priya', action: 'confirm', orderIds: ['p1'], amount: 900, remainingDue: 400 });
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'upi', paymentFeeRate: 0.5, paymentClaim: null });
    expect(mem.read(UID, 'orders', 'p2')).toMatchObject({ paymentStatus: 'unpaid' });
  });

  it('dismiss ("not received") clears the claim and leaves the orders unpaid', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ paymentClaim: CLAIM }));
    const r = await review(deps, { customerKey: 'phone:9876543210', action: 'dismiss' });
    expect(r.body).toMatchObject({ action: 'dismiss', orderIds: ['p1'], remainingDue: 900 });
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ paymentStatus: 'unpaid', paymentClaim: null });
  });

  it('settles a claimed multi-item order whole', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', order({ orderGroupId: 'g', paymentClaim: { ...CLAIM, amount: 1300 } }));
    mem.seed(UID, 'orders', 'b', order({ orderGroupId: 'g', menuItemId: 'bread', quantity: 2, unitPriceAtSale: 200 }));
    const r = await review(deps, { customerKey: 'phone:9876543210', action: 'confirm' });
    expect(r.body.orderIds.sort()).toEqual(['a', 'b']);
    expect(mem.read(UID, 'orders', 'b')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'upi' });
  });

  it('refuses a customer with no claim, a bad action, and a missing idempotency key', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({}));
    expect((await review(deps, { customerKey: 'phone:9876543210', action: 'confirm' })).body.code).toBe('no_claim');
    expect((await review(deps, { customerKey: 'phone:9876543210', action: 'maybe' })).code).toBe(400);
    const noKey = await call(createQuickClaimHandler(deps), { body: { customerKey: 'phone:9876543210', action: 'confirm' } });
    expect(noKey.body.code).toBe('idempotency_key_required');
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ paymentStatus: 'unpaid' });
  });
});

describe('card payments the customer made and never came back from', () => {
  it('asks about the bills behind the unpaid orders before the list is read', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ billToken: 'b'.repeat(32) }));
    mem.seed(UID, 'orders', 'p2', order({ statementToken: 's'.repeat(32), date: '2026-10-02' }));
    // The settler marks p1 paid, as a gateway that says "paid" would.
    deps.settleWaiting = vi.fn(async (uid: string) => { await deps.db.run(uid, async (tx: any) => tx.apply([{ collection: 'orders', id: 'p1', merge: true, data: { paymentStatus: 'paid' } }])); });
    const r = await call(createQuickPaymentsDueHandler(deps), {});
    expect(deps.settleWaiting).toHaveBeenCalledWith(UID, ['b'.repeat(32), 's'.repeat(32)]);
    expect(r.body.customers[0].orders.map((o: any) => o.orderId)).toEqual(['p2']);
  });

  it('still lists everyone when asking fails, and asks nothing when no unpaid order has a bill', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ billToken: 'b'.repeat(32) }));
    deps.settleWaiting = vi.fn().mockRejectedValue(new Error('gateway down'));
    expect((await call(createQuickPaymentsDueHandler(deps), {})).body.customers).toHaveLength(1);
    const quiet = world();
    quiet.mem.seed(UID, 'orders', 'p1', order({}));
    quiet.deps.settleWaiting = vi.fn();
    await call(createQuickPaymentsDueHandler(quiet.deps), {});
    expect(quiet.deps.settleWaiting).not.toHaveBeenCalled();
  });
});

describe('GET /mobile/payment-setup', () => {
  it('says whether bills ask for UPI, and which card payments are set up', async () => {
    const { deps } = world();
    deps.onlinePayments = async () => onlinePaymentsOf({ provider: 'razorpay', keyId: 'rzp_test_1', test: true, updatedAt: 1 });
    const r = await call(createQuickPaymentSetupHandler(deps), {});
    expect(r.body).toEqual({ upi: true, online: { kind: 'gateway', label: 'Razorpay', test: true } });
    const none = world({ upiId: '' });
    expect((await call(createQuickPaymentSetupHandler(none.deps), {})).body).toEqual({ upi: false, online: null });
  });

  it('describes a pasted link, Cashfree\'s sandbox, and nothing for no setup', () => {
    expect(onlinePaymentsOf({ provider: 'link', link: 'https://pay.example/x', updatedAt: 1 })).toEqual({ kind: 'link' });
    expect(onlinePaymentsOf({ provider: 'cashfree', keyId: 'CF1', environment: 'sandbox', updatedAt: 1 })).toEqual({ kind: 'gateway', label: 'Cashfree', test: true });
    expect(onlinePaymentsOf(null)).toBeNull();
  });
});
