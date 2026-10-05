import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  readRazorpayConfig, createRazorpayApi, verifyPaymentSignature, verifyWebhookSignature,
  mapSubscriptionStatus, billingFromSubscription, uidFromNotes, RazorpayError, TOTAL_BILLING_CYCLES,
} from '../razorpay';

const hmac = (msg: string | Buffer, secret: string) => crypto.createHmac('sha256', secret).update(msg).digest('hex');
const NOW = Date.parse('2026-10-05T10:00:00Z');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('readRazorpayConfig', () => {
  it('needs the key id, key secret and plan id; the webhook secret is optional', () => {
    expect(readRazorpayConfig({})).toBeNull();
    expect(readRazorpayConfig({ RAZORPAY_KEY_ID: 'rzp_test_1', RAZORPAY_KEY_SECRET: 's' })).toBeNull();
    expect(readRazorpayConfig({ RAZORPAY_KEY_ID: 'rzp_test_1', RAZORPAY_KEY_SECRET: 's', RAZORPAY_PLAN_ID: 'plan_1' }))
      .toEqual({ keyId: 'rzp_test_1', keySecret: 's', planId: 'plan_1', webhookSecret: null });
    expect(readRazorpayConfig({ RAZORPAY_KEY_ID: ' k ', RAZORPAY_KEY_SECRET: 's', RAZORPAY_PLAN_ID: 'p', RAZORPAY_WEBHOOK_SECRET: ' w ' })?.webhookSecret).toBe('w');
  });
});

describe('createRazorpayApi', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const make = (response: any) => {
    const fetchFn = vi.fn().mockResolvedValue(response);
    return { fetchFn, api: createRazorpayApi({ keyId: 'rzp_test_1', keySecret: 'secret' }, fetchFn as any) };
  };

  it('creates a subscription with the uid in its notes, a start time only for a trial, and basic auth', async () => {
    const { fetchFn, api } = make(ok({ id: 'sub_1', status: 'created' }));
    const sub = await api.createSubscription({ planId: 'plan_1', startAt: 1_800_000_000, uid: 'u1' });
    expect(sub.id).toBe('sub_1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_1:secret').toString('base64')}`);
    expect(JSON.parse(init.body)).toEqual({
      plan_id: 'plan_1', total_count: TOTAL_BILLING_CYCLES, quantity: 1, customer_notify: 1, start_at: 1_800_000_000, notes: { uid: 'u1' },
    });
  });

  it('leaves out the start time when there is no trial, so the first charge is at once', async () => {
    const { fetchFn, api } = make(ok({ id: 'sub_1', status: 'created' }));
    await api.createSubscription({ planId: 'plan_1', uid: 'u1' });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).not.toHaveProperty('start_at');
  });

  it('fetches a subscription and cancels at once or at the end of the period', async () => {
    const { fetchFn, api } = make(ok({ id: 'sub_1', status: 'active' }));
    await api.getSubscription('sub_1');
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_1');
    expect(fetchFn.mock.calls[0][1].method).toBe('GET');
    expect(fetchFn.mock.calls[0][1].body).toBeUndefined();

    await api.cancelSubscription('sub_1', true);
    expect(fetchFn.mock.calls[1][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel');
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({ cancel_at_cycle_end: 1 });
    await api.cancelSubscription('sub_1', false);
    expect(JSON.parse(fetchFn.mock.calls[2][1].body)).toEqual({ cancel_at_cycle_end: 0 });
  });

  it('turns an error response into a RazorpayError carrying its description', async () => {
    const { api } = make({ ok: false, status: 400, json: async () => ({ error: { description: 'start_at is too far away' } }) });
    const err = await api.createSubscription({ planId: 'p', startAt: 1, uid: 'u' }).catch(e => e);
    expect(err).toBeInstanceOf(RazorpayError);
    expect(err.message).toBe('start_at is too far away');
    expect(err.httpStatus).toBe(400);
  });

  it('survives an error body that is not JSON', async () => {
    const { api } = make({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(api.getSubscription('sub_1')).rejects.toThrow('Razorpay returned 502');
  });
});

describe('verifyPaymentSignature', () => {
  const input = { paymentId: 'pay_1', subscriptionId: 'sub_1' };
  it('accepts the HMAC of "<payment id>|<subscription id>" made with the key secret', () => {
    expect(verifyPaymentSignature({ ...input, signature: hmac('pay_1|sub_1', 'secret') }, 'secret')).toBe(true);
  });
  it('rejects a wrong secret, swapped ids, a tampered id and a missing signature', () => {
    expect(verifyPaymentSignature({ ...input, signature: hmac('pay_1|sub_1', 'other') }, 'secret')).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: hmac('sub_1|pay_1', 'secret') }, 'secret')).toBe(false);
    expect(verifyPaymentSignature({ paymentId: 'pay_2', subscriptionId: 'sub_1', signature: hmac('pay_1|sub_1', 'secret') }, 'secret')).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: '' }, 'secret')).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: 'short' }, 'secret')).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const body = Buffer.from('{"event":"subscription.activated"}');
  it('accepts the HMAC of the exact raw body made with the webhook secret', () => {
    expect(verifyWebhookSignature(body, hmac(body, 'whsec'), 'whsec')).toBe(true);
  });
  it('rejects a changed body, a wrong secret and a missing header or secret', () => {
    expect(verifyWebhookSignature(Buffer.from('{"event":"subscription.activated" }'), hmac(body, 'whsec'), 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, hmac(body, 'nope'), 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, undefined, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, hmac(body, 'whsec'), '')).toBe(false);
  });
});

describe('mapSubscriptionStatus', () => {
  const future = sec('2026-11-19T10:00:00Z');
  it('treats an approved mandate with the first charge still ahead as the free trial', () => {
    expect(mapSubscriptionStatus({ status: 'authenticated', start_at: future }, NOW)).toBe('trialing');
  });
  it('does not grant access to an approved mandate whose first charge is due now or past', () => {
    expect(mapSubscriptionStatus({ status: 'authenticated', start_at: sec('2026-10-05T09:00:00Z') }, NOW)).toBe('incomplete');
    expect(mapSubscriptionStatus({ status: 'authenticated', start_at: null }, NOW)).toBe('incomplete');
  });
  it('maps a paying subscription to active', () => {
    expect(mapSubscriptionStatus({ status: 'active' }, NOW)).toBe('active');
  });
  it('maps a failing, halted or paused subscription to past due', () => {
    for (const status of ['pending', 'halted', 'paused']) expect(mapSubscriptionStatus({ status }, NOW)).toBe('past_due');
  });
  it('maps an ended subscription to canceled', () => {
    for (const status of ['cancelled', 'completed', 'expired']) expect(mapSubscriptionStatus({ status }, NOW)).toBe('canceled');
  });
  it('gives no access to a checkout that was never finished, or to a status it does not know', () => {
    expect(mapSubscriptionStatus({ status: 'created' }, NOW)).toBe('incomplete');
    expect(mapSubscriptionStatus({ status: 'something_new' }, NOW)).toBe('incomplete');
  });
});

describe('billingFromSubscription', () => {
  it('a trial: access until the first charge, which is when the trial ends, and the trial is marked used', () => {
    const start = sec('2026-11-19T10:00:00Z');
    expect(billingFromSubscription({ id: 'sub_1', status: 'authenticated', start_at: start, current_end: null }, NOW))
      .toEqual({ razorpaySubscriptionId: 'sub_1', status: 'trialing', currentPeriodEnd: start, trialUsed: true });
  });
  it('a paying subscription: the period ends when the current cycle does', () => {
    const end = sec('2026-12-19T10:00:00Z');
    expect(billingFromSubscription({ id: 'sub_1', status: 'active', current_end: end, charge_at: end + 100 }, NOW))
      .toEqual({ razorpaySubscriptionId: 'sub_1', status: 'active', currentPeriodEnd: end, trialUsed: true });
  });
  it('falls back to the next charge date when there is no current end', () => {
    expect(billingFromSubscription({ id: 'sub_1', status: 'pending', charge_at: 1234 }, NOW).currentPeriodEnd).toBe(1234);
  });
  it('a checkout that was never finished does not use up the trial', () => {
    const b = billingFromSubscription({ id: 'sub_1', status: 'created' }, NOW);
    expect(b.status).toBe('incomplete');
    expect(b).not.toHaveProperty('trialUsed');
  });
  it('an ended subscription clears a scheduled cancellation and never takes the trial back', () => {
    const b = billingFromSubscription({ id: 'sub_1', status: 'cancelled', current_end: 99 }, NOW);
    expect(b.status).toBe('canceled');
    expect(b.cancelScheduled).toBe(false);
    expect(b).not.toHaveProperty('trialUsed');
  });
});

describe('uidFromNotes', () => {
  it('reads the uid the subscription was created for', () => {
    expect(uidFromNotes({ notes: { uid: 'u1' } })).toBe('u1');
  });
  it('is null when there is none (Razorpay sends [] for empty notes)', () => {
    expect(uidFromNotes({ notes: [] })).toBeNull();
    expect(uidFromNotes({ notes: null })).toBeNull();
    expect(uidFromNotes({})).toBeNull();
    expect(uidFromNotes({ notes: { uid: 5 } })).toBeNull();
    expect(uidFromNotes({ notes: { uid: '' } })).toBeNull();
  });
});
