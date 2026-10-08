import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { createBillPageHandler, createPayHandler, createReturnHandler, type PayOnlineDeps } from '../payOnline';
import type { BillRecord, BillRecords, PaymentAttempt } from '../billStore';
import type { GatewayRecord, GatewayStore } from '../gatewayStore';
import { encryptSecret } from '../secretBox';
import { buildBill } from '../../src/utils/billing';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-08T10:00:00Z');
const UID = 'u1';
const TOKEN = 'a'.repeat(32);
const KEY = crypto.randomBytes(32);
const SECRET = 'rzp-secret-value-ABCD';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.type = () => r;
  r.send = (b: string) => { r.body = b; return r; };
  r.set = (h: Record<string, string>) => { Object.assign(r.headers, h); return r; };
  r.redirect = (c: number, to: string) => { r.code = c; r.location = to; return r; };
  return r;
};

/** Reply to a gateway call by its method and path. */
const gatewayFetch = (routes: Record<string, { status?: number; body: unknown } | (() => { status?: number; body: unknown })>) => vi.fn(async (url: string, init: any) => {
  const key = `${init.method} ${url.replace('https://api.razorpay.com/v1', '').replace('https://sandbox.cashfree.com/pg', '')}`;
  const hit = routes[key] ?? routes[Object.keys(routes).find(k => key.startsWith(k)) ?? ''];
  if (!hit) throw new Error(`unexpected gateway call: ${key}`);
  const { status = 200, body } = typeof hit === 'function' ? hit() : hit;
  return { ok: status < 300, status, json: async () => body };
});

function world(over: { gateway?: Partial<GatewayRecord> | null; secretKey?: Buffer | null; orders?: Record<string, any>; bill?: Partial<ReturnType<typeof buildBill>>; payment?: PaymentAttempt; fetch?: any; clock?: { t: number } } = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita Bakes', phone: '98450 00199', paymentFeeRates: { card: 2 } });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Cake', sellingPrice: 900 });
  const orders = over.orders ?? { o1: { menuItemId: 'cake', quantity: 2, date: '2026-10-05', customerName: 'Priya', customerPhone: '98765 43210', unitPriceAtSale: 900, paymentStatus: 'unpaid', advance: { amount: 500, method: 'upi' } } };
  for (const [id, o] of Object.entries(orders)) mem.seed(UID, 'orders', id, o);
  const bill = { ...buildBill({
    orders: Object.entries(orders).map(([id, o]) => ({ id, ...o })) as any, menu: [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 900 }] as any,
    settings: { name: 'Anita Bakes', address: '', phone: '', gstApplicable: false } as any, currency: { code: 'INR', symbol: '₹' },
  }), ...over.bill };

  let record: BillRecord | null = { uid: UID, orderIds: Object.keys(orders), bill, ...(over.payment && { payment: over.payment }) };
  const records: BillRecords = {
    get: async t => (t === TOKEN && record ? structuredClone(record) : null),
    savePayment: async (t, p) => { if (t === TOKEN && record) record = { ...record, payment: structuredClone(p) }; },
  };
  let gw: GatewayRecord | null = over.gateway === null ? null : {
    provider: 'razorpay', keyId: 'rzp_test_AbC123', secretEnc: encryptSecret(SECRET, KEY, UID), secretLast4: 'ABCD', test: true, updatedAt: 1, ...over.gateway,
  };
  const gateways: GatewayStore = { get: async () => gw, put: async (_u, r) => { gw = r; }, remove: async () => { gw = null; } };
  const fetch = over.fetch ?? gatewayFetch({});
  const clock = over.clock ?? { t: NOW };
  const deps: PayOnlineDeps = {
    db: mem.db, records, gateways, fetch, now: () => clock.t,
    secretKey: over.secretKey === undefined ? KEY : over.secretKey, publicUrl: 'https://www.stockpot.in/',
  };
  return { mem, deps, fetch, clock, saved: () => record!.payment, setGateway: (g: GatewayRecord | null) => { gw = g; } };
}

const run = async (make: (d: PayOnlineDeps) => any, deps: PayOnlineDeps, token = TOKEN, query: Record<string, string> = {}) => {
  const r = res();
  await make(deps)({ params: { token }, query } as any, r);
  return r;
};
const page = (d: PayOnlineDeps, q?: Record<string, string>) => run(createBillPageHandler, d, TOKEN, q);
const pay = (d: PayOnlineDeps) => run(createPayHandler, d);
const back = (d: PayOnlineDeps, q?: Record<string, string>) => run(createReturnHandler, d, TOKEN, q);

const RZP_CREATE = { 'POST /payment_links': { body: { id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created' } } };
const rzpPaid = (amountPaise: number, status = 'paid') => ({ 'GET /payment_links/plink_1': { body: { status, amount_paid: amountPaise, payments: [{ payment_id: 'pay_9', status: 'captured' }] } } });
const attempt = (over: Partial<PaymentAttempt> = {}): PaymentAttempt => ({ provider: 'razorpay', linkId: 'plink_1', url: 'https://rzp.io/i/abc', amount: 1300, orderIds: ['o1'], createdAt: NOW - 60_000, status: 'created', ...over });

describe('the bill page', () => {
  it('is the bill as it always was, with no extra reads, for an owner with no gateway', async () => {
    const w = world({ gateway: null });
    const r = await page(w.deps);
    expect(r.code).toBe(200);
    expect(r.body).toContain('Chocolate Cake');
    expect(r.body).not.toMatch(/by card or online|Paid in full/);
    expect(w.mem.stats.transactions).toBe(0);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
  });

  it('offers card or online payment for what is owed now (the advance already taken off), under the UPI button', async () => {
    const w = world();
    const r = await page(w.deps);
    expect(r.body).toContain('href="/bill/' + TOKEN + '/pay"');
    expect(r.body).toContain('Pay ₹1,300.00 by card or online');
    expect(w.fetch).not.toHaveBeenCalled(); // opening the page makes no link and asks nothing
  });

  it('sends the customer to the owner\'s own payment link when that is what was pasted', async () => {
    const w = world({ gateway: { provider: 'link', link: 'https://rzp.io/l/anita', secretEnc: undefined, keyId: undefined } });
    const r = await page(w.deps);
    expect(r.body).toContain('href="https://rzp.io/l/anita"');
    expect(r.body).toContain('by card or online');
  });

  it('offers nothing when the server cannot read the keys, the bill is not in rupees, or the amount is under a rupee', async () => {
    expect((await page(world({ secretKey: null }).deps)).body).not.toContain('by card or online');
    expect((await page(world({ gateway: { secretEnc: encryptSecret('x', KEY, 'someone-else') } }).deps)).body).not.toContain('by card or online');
    const usd = world({ bill: { currency: { code: 'USD', symbol: '$' } } });
    expect((await page(usd.deps)).body).not.toContain('by card or online');
    const tiny = world({ orders: { o1: { menuItemId: 'cake', quantity: 1, date: '2026-10-05', unitPriceAtSale: 0.5, paymentStatus: 'unpaid' } } });
    expect((await page(tiny.deps)).body).not.toContain('by card or online');
  });

  it('says paid in full, with no way to pay, once the orders are paid (by hand too), and a bad token is a 404', async () => {
    const w = world({ orders: { o1: { menuItemId: 'cake', quantity: 2, date: '2026-10-05', unitPriceAtSale: 900, paymentStatus: 'paid' } } });
    const r = await page(w.deps);
    expect(r.body).toContain('Paid in full. Thank you!');
    expect(r.body).not.toMatch(/by card|with UPI/);
    expect((await run(createBillPageHandler, w.deps, 'nope')).code).toBe(404);
    expect((await run(createBillPageHandler, w.deps, 'b'.repeat(32))).code).toBe(404);
  });

  it('opens an old bill that has no owner or orders on record, as it always did', async () => {
    const w = world();
    const old = { ...w.deps, records: { get: async () => ({ uid: '', orderIds: [], bill: (await w.deps.records.get(TOKEN))!.bill }), savePayment: async () => {} } };
    const r = await page(old);
    expect(r.code).toBe(200);
    expect(r.body).toContain('Chocolate Cake');
    expect(r.body).not.toMatch(/by card or online|Paid in full/);
    expect((await pay(old)).code).toBe(404);
    expect((await back(old)).location).toBe(`/bill/${TOKEN}?back=1`);
  });

  it('shows a pasted link only when it is https', async () => {
    const w = world({ gateway: { provider: 'link', link: 'javascript:alert(1)', secretEnc: undefined, keyId: undefined } });
    expect((await page(w.deps)).body).not.toContain('by card or online');
    expect((await pay(w.deps)).location).toBe(`/bill/${TOKEN}`);
  });

  it('still shows the bill when the payment side fails', async () => {
    const w = world();
    const broken = { ...w.deps, gateways: { ...w.deps.gateways, get: async () => { throw new Error('down'); } } };
    const r = await page(broken);
    expect(r.code).toBe(200);
    expect(r.body).toContain('Chocolate Cake');
  });
});

describe('starting a payment', () => {
  it('makes a link for exactly what is owed now, from the server\'s own reading of the orders, and sends the customer to it', async () => {
    const w = world({ fetch: gatewayFetch(RZP_CREATE) });
    const r = await pay(w.deps);
    expect(r.code).toBe(302);
    expect(r.location).toBe('https://rzp.io/i/abc');
    const [url, init] = w.fetch.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/payment_links');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      amount: 130000, currency: 'INR', customer: { name: 'Priya', contact: '98765 43210' },
      callback_url: `https://www.stockpot.in/bill/${TOKEN}/return`, callback_method: 'get',
      expire_by: Math.floor(NOW / 1000) + 24 * 3600, notify: { sms: false, email: false },
    });
    expect(body.reference_id).toMatch(/^sp-aaaaaaaaaaaa-/);
    expect(body.description).toContain('Anita Bakes');
    expect(w.saved()).toMatchObject({ provider: 'razorpay', linkId: 'plink_1', url: 'https://rzp.io/i/abc', amount: 1300, orderIds: ['o1'], status: 'created', createdAt: NOW });
  });

  it('uses the keys saved for this owner, decrypted for the call, and never sends the secret anywhere but as the gateway\'s login', async () => {
    const w = world({ fetch: gatewayFetch(RZP_CREATE) });
    await pay(w.deps);
    const [, init] = w.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`rzp_test_AbC123:${SECRET}`).toString('base64')}`);
    expect(init.body).not.toContain(SECRET);
    expect(JSON.stringify(w.saved())).not.toContain(SECRET);
  });

  it('reuses the link while the amount and orders are the same, so opening the button again makes no new one', async () => {
    const w = world({ fetch: gatewayFetch({ ...RZP_CREATE, 'GET /payment_links/plink_1': { body: { status: 'created', amount_paid: 0 } } }) });
    await pay(w.deps);
    w.clock.t += 60_000;
    const again = await pay(w.deps);
    expect(again.location).toBe('https://rzp.io/i/abc');
    expect(w.fetch.mock.calls.filter(c => c[1].method === 'POST')).toHaveLength(1);
  });

  it('asks the gateway about a waiting link at most every few seconds, however often the button is opened', async () => {
    const w = world({ payment: attempt(), fetch: gatewayFetch({ 'GET /payment_links/plink_1': { body: { status: 'created', amount_paid: 0 } } }) });
    for (let i = 0; i < 5; i++) await pay(w.deps);
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });

  it('makes a new link when what is owed has changed, or the old link is old', async () => {
    const w = world({ payment: attempt({ amount: 900 }), fetch: gatewayFetch({ ...RZP_CREATE, 'GET /payment_links/plink_1': { body: { status: 'created', amount_paid: 0 } } }) });
    expect((await pay(w.deps)).location).toBe('https://rzp.io/i/abc');
    expect(w.fetch.mock.calls.some(c => c[1].method === 'POST')).toBe(true);
    const old = world({ payment: attempt({ createdAt: NOW - 13 * 3600_000 }), fetch: gatewayFetch({ ...RZP_CREATE, 'GET /payment_links/plink_1': { body: { status: 'created', amount_paid: 0 } } }) });
    await pay(old.deps);
    expect(old.fetch.mock.calls.some(c => c[1].method === 'POST')).toBe(true);
  });

  it('makes no link when nothing is owed, and says nothing about the gateway when it fails', async () => {
    const paid = world({ orders: { o1: { menuItemId: 'cake', quantity: 2, date: '2026-10-05', unitPriceAtSale: 900, paymentStatus: 'paid' } } });
    const r = await pay(paid.deps);
    expect(r.location).toBe(`/bill/${TOKEN}`);
    expect(paid.fetch).not.toHaveBeenCalled();

    const failing = world({ fetch: gatewayFetch({ 'POST /payment_links': { status: 400, body: { error: { description: `Payment Links is not enabled; key ${SECRET}` } } } }) });
    const bad = await pay(failing.deps);
    expect(bad.code).toBe(502);
    expect(bad.body).toContain('could not start the card payment');
    expect(bad.body).not.toMatch(/Payment Links|rzp_|ABCD|enabled/);
    expect(failing.saved()).toBeUndefined();
  });

  it('goes straight to a pasted payment link, and back to the bill when there is no gateway', async () => {
    const link = world({ gateway: { provider: 'link', link: 'https://rzp.io/l/anita', secretEnc: undefined, keyId: undefined } });
    expect((await pay(link.deps)).location).toBe('https://rzp.io/l/anita');
    expect((await pay(world({ gateway: null }).deps)).location).toBe(`/bill/${TOKEN}`);
    expect((await run(createPayHandler, link.deps, 'nope')).code).toBe(404);
  });

  it('works for a statement: what is owed across all the orders, nothing for the paid ones', async () => {
    const w = world({
      orders: {
        a: { menuItemId: 'cake', quantity: 1, date: '2026-10-01', customerName: 'Priya', unitPriceAtSale: 900, paymentStatus: 'unpaid' },
        b: { menuItemId: 'cake', quantity: 2, date: '2026-10-03', customerName: 'Priya', unitPriceAtSale: 900, paymentStatus: 'unpaid' },
        c: { menuItemId: 'cake', quantity: 5, date: '2026-10-04', customerName: 'Priya', unitPriceAtSale: 900, paymentStatus: 'paid' },
      },
      bill: { kind: 'statement' as const },
      fetch: gatewayFetch(RZP_CREATE),
    });
    await pay(w.deps);
    expect(JSON.parse(w.fetch.mock.calls[0][1].body).amount).toBe(270000);
    expect(w.saved()!.orderIds.sort()).toEqual(['a', 'b']);
  });

  it('uses Cashfree on its own service when that is the gateway', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ link_id: 'x', link_url: 'https://payments-test.cashfree.com/links/xyz' }) }));
    const w = world({ gateway: { provider: 'cashfree', keyId: 'CF12345', environment: 'sandbox', secretEnc: encryptSecret('cfsk_secret_value', KEY, UID) }, fetch: f });
    const r = await pay(w.deps);
    expect(r.location).toBe('https://payments-test.cashfree.com/links/xyz');
    expect((f.mock.calls[0] as any)[0]).toBe('https://sandbox.cashfree.com/pg/links');
    expect(JSON.parse((f.mock.calls[0] as any)[1].body)).toMatchObject({ link_amount: 1300, customer_details: { customer_phone: '9876543210' } });
  });
});

describe('coming back from the gateway', () => {
  const settledWorld = (extra: Parameters<typeof world>[0] = {}) => world({ payment: attempt(), fetch: gatewayFetch(rzpPaid(130000)), ...extra });

  it('asks the gateway, and only then marks the orders paid by card, with the card fee, once', async () => {
    const w = settledWorld();
    const r = await back(w.deps, { razorpay_payment_link_status: 'paid' });
    expect(r.code).toBe(303);
    expect(r.location).toBe(`/bill/${TOKEN}?back=1`);
    expect(w.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'card', paymentFeeRate: 2 });
    expect(w.saved()).toMatchObject({ status: 'settled', settledAt: NOW, paymentId: 'pay_9' });
    expect(w.saved()!.note).toBeUndefined();
    const writesAfterFirst = w.mem.stats.writes;
    await back(w.deps);
    await back(w.deps);
    expect(w.mem.stats.writes).toBe(writesAfterFirst); // nothing marked again
    expect(w.fetch).toHaveBeenCalledTimes(1);          // and a settled payment is not asked about again
  });

  it('believes nothing on the address: a return that says paid, for a link the gateway says is not, marks nothing', async () => {
    const w = world({ payment: attempt(), fetch: gatewayFetch(rzpPaid(0, 'created')) });
    const r = await back(w.deps, { razorpay_payment_link_status: 'paid', razorpay_payment_id: 'pay_fake', status: 'paid' });
    expect(r.location).toBe(`/bill/${TOKEN}?back=1`);
    expect(w.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'unpaid' });
    expect(w.saved()!.status).toBe('created');
    const shown = await page(w.deps, { back: '1' });
    expect(shown.body).toContain('We have not received the payment yet');
    expect(shown.body).toContain('by card or online');
  });

  it('marks nothing for a part-payment, or a payment of less than the link asked for', async () => {
    for (const body of [rzpPaid(50000, 'partially_paid'), rzpPaid(100000, 'paid')]) {
      const w = world({ payment: attempt(), fetch: gatewayFetch(body) });
      await back(w.deps);
      expect(w.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'unpaid' });
      expect(w.saved()!.status).toBe('created');
    }
  });

  it('marks only what is still unpaid, and notes it when the owner had already marked the orders paid', async () => {
    const w = settledWorld({ orders: { o1: { menuItemId: 'cake', quantity: 2, date: '2026-10-05', unitPriceAtSale: 900, paymentStatus: 'paid', paymentMethod: 'cash' } } });
    await back(w.deps);
    expect(w.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash' }); // untouched
    expect(w.saved()).toMatchObject({ status: 'settled', note: 'orders_already_paid' });
  });

  it('shows the customer "Payment received" afterwards, and no pay buttons', async () => {
    const w = settledWorld();
    await back(w.deps);
    const shown = await page(w.deps, { back: '1' });
    expect(shown.body).toContain('Payment received. Thank you!');
    expect(shown.body).toContain('Paid in full. Thank you!');
    expect(shown.body).not.toMatch(/by card|with UPI/);
  });

  it('settles on opening the bill again even if the customer never came back from the gateway, but asks only every few seconds', async () => {
    const w = world({ payment: attempt(), fetch: gatewayFetch(rzpPaid(0, 'created')) });
    await page(w.deps);
    await page(w.deps);
    expect(w.fetch).toHaveBeenCalledTimes(1);   // the second look is too soon
    w.clock.t += 30_000;
    await page(w.deps);
    expect(w.fetch).toHaveBeenCalledTimes(2);
    const paid = world({ payment: attempt(), fetch: gatewayFetch(rzpPaid(130000)) });
    const r = await page(paid.deps);
    expect(r.body).toContain('Paid in full');
    expect(paid.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'card' });
  });

  it('leaves the payment waiting, and the bill readable, when the gateway cannot be reached or the keys were removed', async () => {
    const down = world({ payment: attempt(), fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    const r = await back(down.deps);
    expect(r.location).toBe(`/bill/${TOKEN}?back=1`);
    expect(down.mem.read(UID, 'orders', 'o1')).toMatchObject({ paymentStatus: 'unpaid' });
    const removed = world({ payment: attempt(), gateway: null });
    await back(removed.deps);
    expect(removed.saved()!.status).toBe('created');
    expect((await run(createReturnHandler, removed.deps, 'nope')).code).toBe(404);
  });
});
