import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth';
import { createQuickBillSentHandler, createQuickPaymentsDueHandler, createQuickTodayHandler, createQuickUpcomingHandler, type QuickRouteDeps } from '../quickRoutes';
import type { PaymentDueSummary, PaymentsDueView, TodayView, UpcomingOrder, UpcomingView } from '../../src/utils/quickApiTypes';
import { memoryQuickDb } from './memoryQuickDb';
import { BILL_REMIND_AFTER_MS, billState, billSentAtFor, ordersToRemind } from '../../src/utils/billReminders';

const NOW = Date.parse('2026-10-12T06:30:00Z'); // Mon 12 Oct, noon in India
const UID = 'u1';

interface FakeRes { code: number; body: unknown; headers: Record<string, string>; status: (c: number) => FakeRes; json: (b: unknown) => FakeRes; setHeader: (k: string, v: string) => void }
const res = (): FakeRes => {
  const r = { code: 200, headers: {} } as FakeRes;
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};
function world() {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  const deps = { db: mem.db, now: () => NOW, newId: () => 'x' } as unknown as QuickRouteDeps;
  return { mem, deps };
}
const order = (over: Record<string, unknown>) => ({ menuItemId: 'cake', quantity: 1, date: '2026-10-08', unitPriceAtSale: 900, paymentStatus: 'unpaid', customerName: 'Priya', customerPhone: '98765 43210', ...over });
type Handler = (req: AuthedRequest, res: Response) => unknown;
const call = async (handler: Handler, req: Record<string, unknown>) => {
  const r = res();
  await handler({ uid: UID, headers: {}, query: {}, params: {}, ...req } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};
let n = 0;
const sent = (deps: QuickRouteDeps, body: unknown) => call(createQuickBillSentHandler(deps), { body, headers: { 'idempotency-key': `bill-key-${String(++n).padStart(8, '0')}` } });
const byName = (customers: PaymentDueSummary[], name: string) => customers.find(c => c.name === name)!;

describe('POST /mobile/bills/sent', () => {
  it('marks the unpaid orders the bill was for, and leaves paid, cancelled and unknown ones alone', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', order({}));
    mem.seed(UID, 'orders', 'b', order({ paymentStatus: 'paid' }));
    mem.seed(UID, 'orders', 'c', order({ cancelledOn: '2026-10-09' }));
    const r = await sent(deps, { orderIds: ['a', 'b', 'c', 'gone'] });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ orderIds: ['a'], at: NOW });
    expect(mem.read(UID, 'orders', 'a')).toMatchObject({ billSentAt: NOW });
    expect(mem.read(UID, 'orders', 'b').billSentAt).toBeUndefined();
  });

  it('needs an idempotency key and a list of order ids', async () => {
    const { deps } = world();
    expect((await call(createQuickBillSentHandler(deps), { body: { orderIds: ['a'] } })).code).toBe(400);
    expect((await sent(deps, { orderIds: [] })).code).toBe(400);
    expect((await sent(deps, { orderIds: ['has space'] })).code).toBe(400);
  });

  it('shows when a customer was billed in Payments due and Today, once every unpaid order of theirs was in a bill', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', order({ billSentAt: NOW - 3_600_000 }));
    mem.seed(UID, 'orders', 'r', order({ customerName: 'Rohan', customerPhone: '98450 11111' }));
    const due = (await call(createQuickPaymentsDueHandler(deps), {})).body as PaymentsDueView;
    expect(byName(due.customers, 'Priya').billSentAt).toBe(NOW - 3_600_000);
    expect(byName(due.customers, 'Rohan').billSentAt).toBeUndefined();
    const today = (await call(createQuickTodayHandler(deps), {})).body as TodayView;
    expect(byName(today.pendingPayments.top, 'Priya').billSentAt).toBe(NOW - 3_600_000);
    // A new order since the bill: there is something new to send
    mem.seed(UID, 'orders', 'a2', order({ date: '2026-10-10' }));
    const after = (await call(createQuickPaymentsDueHandler(deps), {})).body as PaymentsDueView;
    expect(byName(after.customers, 'Priya').billSentAt).toBeUndefined();
  });

  it('shows when a pre-order\'s invoice was sent in Upcoming', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'pre', order({ date: '2026-10-15', preorder: true, billSentAt: NOW - 1000 }));
    const view = (await call(createQuickUpcomingHandler(deps), {})).body as UpcomingView;
    const all: UpcomingOrder[] = [...view.upcoming, ...view.overdue];
    expect(all.find(o => o.orderId === 'pre')?.billSentAt).toBe(NOW - 1000);
  });
});

describe('billReminders', () => {
  it('counts a customer as billed only when every unpaid order was, from the earliest sending', () => {
    expect(billSentAtFor([{ billSentAt: 5 }, { billSentAt: 3 }])).toBe(3);
    expect(billSentAtFor([{ billSentAt: 5 }, {}])).toBeUndefined();
    expect(billSentAtFor([])).toBeUndefined();
  });
  it('is "sent" for two days, then "unpaid after the bill"', () => {
    expect(billState(undefined, NOW)).toBe('not_sent');
    expect(billState(NOW - BILL_REMIND_AFTER_MS + 1, NOW)).toBe('sent');
    expect(billState(NOW - BILL_REMIND_AFTER_MS, NOW)).toBe('unpaid_after_bill');
  });
  it('reminds once for each sending', () => {
    const old = NOW - BILL_REMIND_AFTER_MS - 1;
    expect(ordersToRemind([{ billSentAt: old }], NOW)).toHaveLength(1);
    expect(ordersToRemind([{ billSentAt: old, billRemindedAt: NOW - 10 }], NOW)).toHaveLength(0);
    // Sent again after the reminder: due again two days later
    expect(ordersToRemind([{ billSentAt: old, billRemindedAt: old - 5 }], NOW)).toHaveLength(1);
    expect(ordersToRemind([{ billSentAt: NOW - 1000 }], NOW)).toHaveLength(0);
  });
});
