import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  paywallApplies, createBillingStatusHandler, createSubscriptionHandler, createVerifyPaymentHandler, createCancelHandler, createWebhookHandler,
  type BillingRouteDeps,
} from '../billingRoutes';
import type { BillingInfo } from '../subscriptionStore';
import type { RazorpaySubscription } from '../razorpay';
import { RazorpayError } from '../razorpay';
import { TRIAL_DAYS } from '../../src/utils/trial';

const NOW = Date.parse('2026-10-05T10:00:00Z');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const hmac = (msg: string | Buffer, secret: string) => crypto.createHmac('sha256', secret).update(msg).digest('hex');
const res = () => {
  const r: any = { code: 200 };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.send = (b: any) => { r.body = b; return r; };
  return r;
};
const BLANK: BillingInfo = { razorpaySubscriptionId: null, status: 'none', currentPeriodEnd: null, trialUsed: false, cancelScheduled: false, lastEventAt: 0, updatedAt: 0 };

/** An in-memory store, a fake Razorpay and every dependency the handlers take. */
function setup(initial: Record<string, Partial<BillingInfo>> = {}, over: Partial<BillingRouteDeps> = {}) {
  const db: Record<string, BillingInfo> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, { ...BLANK, ...v }]));
  const api = {
    createSubscription: vi.fn(async (_i: any): Promise<RazorpaySubscription> => ({ id: 'sub_new', status: 'created' })),
    getSubscription: vi.fn(async (id: string): Promise<RazorpaySubscription> => ({ id, status: 'active' })),
    cancelSubscription: vi.fn(async (id: string, _atEnd: boolean): Promise<RazorpaySubscription> => ({ id, status: 'cancelled' })),
  };
  const deps: BillingRouteDeps = {
    billingDisabled: () => false,
    config: () => ({ keyId: 'rzp_test_1', keySecret: 'secret', planId: 'plan_1', webhookSecret: 'whsec' }),
    api: () => api as any,
    store: {
      get: async uid => ({ ...(db[uid] ?? BLANK) }),
      set: vi.fn(async (uid, patch) => { db[uid] = { ...(db[uid] ?? BLANK), ...patch }; }),
      findUidBySubscriptionId: vi.fn(async id => Object.entries(db).find(([, b]) => b.razorpaySubscriptionId === id)?.[0] ?? null),
    },
    now: () => NOW,
    ...over,
  };
  return { db, api, deps };
}
const authed = (body: any = {}, uid = 'u1') => ({ uid, body }) as any;

describe('GET /billing/status', () => {
  const status = (deps: BillingRouteDeps, paywall: (account: { email?: string; emailVerified?: boolean }) => boolean = () => false) => createBillingStatusHandler({ ...deps, paywall });
  it('returns the stored billing info and whether this account must have a plan', async () => {
    const { deps } = setup({ u1: { status: 'trialing', currentPeriodEnd: 5 } });
    let r = res(); await status(deps)(authed(), r);
    expect(r.body).toMatchObject({ status: 'trialing', paywall: false });
    const asked: any[] = [];
    r = res(); await status(deps, (acct: any) => { asked.push(acct); return true; })({ uid: 'u1', email: 'a@x.com', emailVerified: true } as any, r);
    expect(r.body.paywall).toBe(true);
    expect(asked).toEqual([{ email: 'a@x.com', emailVerified: true }]);
  });
  it('says active, with no paywall, while billing is switched off for testing', async () => {
    const { deps } = setup({}, { billingDisabled: () => true });
    const r = res(); await status(deps, () => true)(authed(), r);
    expect(r.body).toMatchObject({ status: 'active', paywall: false });
  });
  it('answers 500 when the store fails', async () => {
    const { deps } = setup();
    deps.store.get = async () => { throw new Error('down'); };
    const r = res(); await status(deps)(authed(), r);
    expect(r.code).toBe(500);
  });
});

describe('paywallApplies', () => {
  const configured = { RAZORPAY_KEY_ID: 'rzp_test_1', RAZORPAY_KEY_SECRET: 's', RAZORPAY_PLAN_ID: 'plan_1' };
  const asha = { email: 'asha@example.com', emailVerified: true };

  it('is off for everyone by default, so deploying billing changes nothing', () => {
    expect(paywallApplies(asha, configured)).toBe(false);
  });
  it('BILLING_ENFORCED=true puts every account behind it', () => {
    expect(paywallApplies(asha, { ...configured, BILLING_ENFORCED: 'true' })).toBe(true);
    expect(paywallApplies({}, { ...configured, BILLING_ENFORCED: 'true' })).toBe(true);
  });
  it('BILLING_ENFORCED_EMAILS puts only the listed, verified accounts behind it', () => {
    const env = { ...configured, BILLING_ENFORCED_EMAILS: ' Asha@Example.com , tester@example.com ' };
    expect(paywallApplies(asha, env)).toBe(true);
    expect(paywallApplies({ email: 'someone@example.com', emailVerified: true }, env)).toBe(false);
    expect(paywallApplies({ email: 'asha@example.com', emailVerified: false }, env)).toBe(false); // an unverified email proves nothing
    expect(paywallApplies({}, env)).toBe(false);
  });
  it('never applies to a demo account', () => {
    expect(paywallApplies({ email: 'demo_1700000000_42@bettereat.com', emailVerified: true }, { ...configured, BILLING_ENFORCED: 'true' })).toBe(false);
  });
  it('never applies while the testing switch is on', () => {
    expect(paywallApplies(asha, { ...configured, BILLING_ENFORCED: 'true', BILLING_DISABLED: 'true' })).toBe(false);
  });
  it('never applies when Razorpay is not set up, so nobody is locked out of an app they cannot pay for', () => {
    expect(paywallApplies(asha, { BILLING_ENFORCED: 'true' })).toBe(false);
    expect(paywallApplies(asha, { ...configured, RAZORPAY_PLAN_ID: '', BILLING_ENFORCED: 'true' })).toBe(false);
  });
});

describe('POST /billing/create-subscription', () => {
  it('refuses while billing is switched off, and when Razorpay is not set up', async () => {
    let r = res(); await createSubscriptionHandler(setup({}, { billingDisabled: () => true }).deps)(authed(), r);
    expect(r.code).toBe(400);
    const { deps, api } = setup({}, { config: () => null });
    r = res(); await createSubscriptionHandler(deps)(authed(), r);
    expect(r.code).toBe(500);
    expect(api.createSubscription).not.toHaveBeenCalled();
  });

  it('gives a first-time subscriber the free trial: the first charge is TRIAL_DAYS from now', async () => {
    const { deps, api, db } = setup();
    const r = res(); await createSubscriptionHandler(deps)(authed(), r);
    expect(api.createSubscription).toHaveBeenCalledWith({ planId: 'plan_1', startAt: Math.floor(NOW / 1000) + TRIAL_DAYS * 86400, uid: 'u1' });
    expect(r.body).toEqual({ keyId: 'rzp_test_1', subscriptionId: 'sub_new', trial: true, trialDays: TRIAL_DAYS });
    expect(db.u1.razorpaySubscriptionId).toBe('sub_new');
    expect(db.u1.status).toBe('none'); // nothing is granted until the payment is confirmed
  });

  it('charges from the start for someone who already used their trial', async () => {
    const { deps, api } = setup({ u1: { status: 'canceled', trialUsed: true, razorpaySubscriptionId: 'sub_old' } });
    const r = res(); await createSubscriptionHandler(deps)(authed(), r);
    expect(api.createSubscription.mock.calls[0][0]).toEqual({ planId: 'plan_1', startAt: undefined, uid: 'u1' });
    expect(r.body.trial).toBe(false);
  });

  it('lets someone who abandoned checkout try again with the trial still available', async () => {
    const { deps, db } = setup({ u1: { status: 'incomplete', trialUsed: false, razorpaySubscriptionId: 'sub_abandoned' } });
    const r = res(); await createSubscriptionHandler(deps)(authed(), r);
    expect(r.body.trial).toBe(true);
    expect(db.u1.razorpaySubscriptionId).toBe('sub_new');
  });

  it('does not start a second subscription for someone who already has access', async () => {
    for (const status of ['active', 'trialing'] as const) {
      const { deps, api } = setup({ u1: { status } });
      const r = res(); await createSubscriptionHandler(deps)(authed(), r);
      expect(r.code).toBe(409);
      expect(api.createSubscription).not.toHaveBeenCalled();
    }
  });

  it('answers 500 without saving anything when Razorpay refuses', async () => {
    const { deps, api, db } = setup();
    api.createSubscription.mockRejectedValue(new RazorpayError('start_at is too far away', 400));
    const r = res(); await createSubscriptionHandler(deps)(authed(), r);
    expect(r.code).toBe(500);
    expect(r.body).toEqual({ error: 'Failed to start checkout' });
    expect(db.u1).toBeUndefined();
  });
});

describe('POST /billing/verify-payment', () => {
  const proof = (over: Record<string, string> = {}) => ({
    razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_1', razorpay_signature: hmac('pay_1|sub_1', 'secret'), ...over,
  });

  it('checks the proof, then takes the status from Razorpay: a trial', async () => {
    const start = sec('2026-11-19T10:00:00Z');
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1' } });
    api.getSubscription.mockResolvedValue({ id: 'sub_1', status: 'authenticated', start_at: start });
    const r = res(); await createVerifyPaymentHandler(deps)(authed(proof()), r);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ status: 'trialing', currentPeriodEnd: start, trialUsed: true, cancelScheduled: false });
    expect(db.u1).toMatchObject({ status: 'trialing', trialUsed: true, currentPeriodEnd: start });
  });

  it('does not unlock anything when Razorpay still says the checkout is unfinished', async () => {
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1' } });
    api.getSubscription.mockResolvedValue({ id: 'sub_1', status: 'created' });
    const r = res(); await createVerifyPaymentHandler(deps)(authed(proof()), r);
    expect(r.body.status).toBe('incomplete');
    expect(db.u1.status).toBe('incomplete');
  });

  it('rejects missing details', async () => {
    const { deps } = setup({ u1: { razorpaySubscriptionId: 'sub_1' } });
    const r = res(); await createVerifyPaymentHandler(deps)(authed({ razorpay_payment_id: 'pay_1' }), r);
    expect(r.code).toBe(400);
  });

  it('rejects a wrong signature, and never asks Razorpay or changes anything', async () => {
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1' } });
    const r = res(); await createVerifyPaymentHandler(deps)(authed(proof({ razorpay_signature: hmac('pay_1|sub_1', 'forged') })), r);
    expect(r.code).toBe(400);
    expect(api.getSubscription).not.toHaveBeenCalled();
    expect(db.u1.status).toBe('none');
  });

  it('rejects a genuine payment for a subscription that is not this account\'s', async () => {
    const { deps, api } = setup({ u1: { razorpaySubscriptionId: 'sub_mine' } });
    const r = res(); await createVerifyPaymentHandler(deps)(authed(proof()), r); // valid proof, but for sub_1
    expect(r.code).toBe(400);
    expect(api.getSubscription).not.toHaveBeenCalled();
  });
});

describe('POST /billing/cancel', () => {
  it('says so when there is no subscription', async () => {
    const r = res(); await createCancelHandler(setup().deps)(authed(), r);
    expect(r.code).toBe(400);
  });

  it('a paying subscription ends at the end of the period, so access continues', async () => {
    const end = sec('2026-11-05T10:00:00Z');
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'active' } });
    api.getSubscription.mockResolvedValue({ id: 'sub_1', status: 'active', current_end: end });
    api.cancelSubscription.mockResolvedValue({ id: 'sub_1', status: 'active', current_end: end });
    const r = res(); await createCancelHandler(deps)(authed(), r);
    expect(api.cancelSubscription).toHaveBeenCalledWith('sub_1', true);
    expect(r.body).toMatchObject({ status: 'active', cancelScheduled: true, currentPeriodEnd: end });
    expect(db.u1).toMatchObject({ status: 'active', cancelScheduled: true });
  });

  it('a trial ends at once, and the trial stays used so it cannot be started again', async () => {
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'trialing' } });
    api.getSubscription.mockResolvedValue({ id: 'sub_1', status: 'authenticated', start_at: sec('2026-11-19T10:00:00Z') });
    api.cancelSubscription.mockResolvedValue({ id: 'sub_1', status: 'cancelled' });
    const r = res(); await createCancelHandler(deps)(authed(), r);
    expect(api.cancelSubscription).toHaveBeenCalledWith('sub_1', false);
    expect(r.body).toMatchObject({ status: 'canceled', cancelScheduled: false, trialUsed: true });
    expect(db.u1.trialUsed).toBe(true);
  });

  it('does not cancel again an ended subscription; it just reports it', async () => {
    const { deps, api } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'active' } });
    api.getSubscription.mockResolvedValue({ id: 'sub_1', status: 'cancelled' });
    const r = res(); await createCancelHandler(deps)(authed(), r);
    expect(api.cancelSubscription).not.toHaveBeenCalled();
    expect(r.body.status).toBe('canceled');
  });

  it('answers 500 and keeps the subscription when Razorpay fails', async () => {
    const { deps, api, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'active' } });
    api.cancelSubscription.mockRejectedValue(new Error('boom'));
    const r = res(); await createCancelHandler(deps)(authed(), r);
    expect(r.code).toBe(500);
    expect(db.u1.status).toBe('active');
  });
});

describe('POST /billing/webhook', () => {
  const event = (name: string, sub: Partial<RazorpaySubscription>, createdAt = sec('2026-10-05T10:00:00Z')) => ({
    entity: 'event', event: name, created_at: createdAt, payload: { subscription: { entity: { notes: { uid: 'u1' }, ...sub } } },
  });
  const send = async (deps: BillingRouteDeps, body: unknown, { sign = true, secret = 'whsec', header }: { sign?: boolean; secret?: string; header?: string } = {}) => {
    const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const headers: Record<string, string> = {};
    if (header !== undefined) headers['x-razorpay-signature'] = header;
    else if (sign) headers['x-razorpay-signature'] = hmac(raw, secret);
    const r = res();
    await createWebhookHandler(deps)({ headers, body: raw } as any, r);
    return r;
  };

  it('applies a signed event: a charge succeeded, so the plan is active', async () => {
    const end = sec('2026-11-19T10:00:00Z');
    const { deps, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'trialing', trialUsed: true } });
    const r = await send(deps, event('subscription.charged', { id: 'sub_1', status: 'active', current_end: end }));
    expect(r.code).toBe(200);
    expect(db.u1).toMatchObject({ status: 'active', currentPeriodEnd: end, lastEventAt: sec('2026-10-05T10:00:00Z') * 1000 });
  });

  it('a failed charge makes it past due; a cancellation ends it', async () => {
    const { deps, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'active' } });
    await send(deps, event('subscription.pending', { id: 'sub_1', status: 'pending' }, sec('2026-10-05T10:00:00Z')));
    expect(db.u1.status).toBe('past_due');
    await send(deps, event('subscription.cancelled', { id: 'sub_1', status: 'cancelled' }, sec('2026-10-06T10:00:00Z')));
    expect(db.u1.status).toBe('canceled');
  });

  it('refuses when no webhook secret is set up', async () => {
    const { deps } = setup({}, { config: () => ({ keyId: 'k', keySecret: 's', planId: 'p', webhookSecret: null }) });
    expect((await send(deps, event('subscription.activated', { id: 'sub_1', status: 'active' }))).code).toBe(500);
  });

  it('rejects a missing header, a wrong signature and a body changed after signing, changing nothing', async () => {
    const { deps, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'trialing' } });
    const body = event('subscription.activated', { id: 'sub_1', status: 'active' });
    expect((await send(deps, body, { sign: false })).code).toBe(400);
    expect((await send(deps, body, { secret: 'forged' })).code).toBe(400);
    const raw = JSON.stringify(body);
    expect((await send(deps, raw + ' ', { header: hmac(raw, 'whsec') })).code).toBe(400);
    expect(db.u1.status).toBe('trialing');
  });

  it('ignores events that are not about a subscription', async () => {
    const { deps } = setup();
    const r = await send(deps, { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } });
    expect(r.body).toEqual({ received: true });
    expect(deps.store.set).not.toHaveBeenCalled();
  });

  it('ignores a replaced checkout: events for a subscription that is not the account\'s current one', async () => {
    const { deps, db } = setup({ u1: { razorpaySubscriptionId: 'sub_current', status: 'incomplete' } });
    await send(deps, event('subscription.activated', { id: 'sub_old', status: 'active' }));
    expect(db.u1.status).toBe('incomplete');
  });

  it('ignores an event older than the one already applied', async () => {
    const { deps, db } = setup({ u1: { razorpaySubscriptionId: 'sub_1', status: 'canceled', lastEventAt: sec('2026-10-06T00:00:00Z') * 1000 } });
    await send(deps, event('subscription.activated', { id: 'sub_1', status: 'active' }, sec('2026-10-05T00:00:00Z')));
    expect(db.u1.status).toBe('canceled');
  });

  it('finds the account by subscription id when the notes carry no uid', async () => {
    const { deps, db } = setup({ u9: { razorpaySubscriptionId: 'sub_9', status: 'incomplete' } });
    await send(deps, event('subscription.activated', { id: 'sub_9', status: 'active', notes: [] as any }));
    expect(db.u9.status).toBe('active');
    expect(deps.store.findUidBySubscriptionId).toHaveBeenCalledWith('sub_9');
  });

  it('acknowledges an event for an account it does not know, so Razorpay stops retrying', async () => {
    const { deps } = setup();
    const r = await send(deps, event('subscription.activated', { id: 'sub_x', status: 'active', notes: [] as any }));
    expect(r.code).toBe(200);
  });

  it('answers 500 so Razorpay retries when the store fails', async () => {
    const { deps } = setup({ u1: { razorpaySubscriptionId: 'sub_1' } });
    deps.store.set = vi.fn().mockRejectedValue(new Error('firestore down'));
    const r = await send(deps, event('subscription.activated', { id: 'sub_1', status: 'active' }));
    expect(r.code).toBe(500);
  });
});
