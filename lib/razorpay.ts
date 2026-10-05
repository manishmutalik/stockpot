/**
 * razorpay.ts
 *
 * Everything the server needs from Razorpay Subscriptions, with no Express or
 * Firebase in it so it can be tested on its own: a small API client (plain
 * `fetch`, injectable), the two signature checks, and the mapping from a
 * Razorpay subscription to the plan status the app gates on.
 *
 * Nothing here runs at import time. If Razorpay is not configured the server
 * still boots and every non-billing route works; only a billing request fails,
 * with a clear message.
 */
import crypto from 'node:crypto';
import type { BillingInfo, SubscriptionStatus } from './subscriptionStore';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  planId: string;
  /** Only the webhook route needs this. */
  webhookSecret: string | null;
}

/** The three values checkout needs; the webhook secret is optional here. Null when billing is not set up. */
export function readRazorpayConfig(env: Record<string, string | undefined> = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const planId = env.RAZORPAY_PLAN_ID?.trim();
  if (!keyId || !keySecret || !planId) return null;
  return { keyId, keySecret, planId, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || null };
}

/** The fields of a Razorpay subscription this app reads. Times are unix seconds. */
export interface RazorpaySubscription {
  id: string;
  status: string;
  plan_id?: string;
  start_at?: number | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  paid_count?: number;
  notes?: Record<string, unknown> | unknown[] | null;
}

export class RazorpayError extends Error {
  constructor(message: string, readonly httpStatus: number) { super(message); this.name = 'RazorpayError'; }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const API = 'https://api.razorpay.com/v1';

/** A monthly plan runs for this many billing cycles (ten years) before it completes. */
export const TOTAL_BILLING_CYCLES = 120;

export function createRazorpayApi(config: Pick<RazorpayConfig, 'keyId' | 'keySecret'>, fetchFn: FetchLike = fetch as unknown as FetchLike) {
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetchFn(`${API}${path}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new RazorpayError(data?.error?.description || `Razorpay returned ${res.status}`, res.status);
    return data as T;
  }

  return {
    createSubscription: (input: { planId: string; startAt?: number; uid: string }) =>
      call<RazorpaySubscription>('POST', '/subscriptions', {
        plan_id: input.planId,
        total_count: TOTAL_BILLING_CYCLES,
        quantity: 1,
        customer_notify: 1,
        ...(input.startAt && { start_at: input.startAt }),
        notes: { uid: input.uid },
      }),
    getSubscription: (id: string) => call<RazorpaySubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`),
    /** `atCycleEnd` keeps access until the end of the period already paid for. */
    cancelSubscription: (id: string, atCycleEnd: boolean) =>
      call<RazorpaySubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  };
}

export type RazorpayApi = ReturnType<typeof createRazorpayApi>;

const hmacHex = (message: string | Buffer, secret: string) => crypto.createHmac('sha256', secret).update(message).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Checks the proof Razorpay Checkout hands the browser after a payment. For a
 * subscription the signed text is "<payment id>|<subscription id>", signed with
 * the key secret. Without this anyone could post a made-up payment id.
 */
export function verifyPaymentSignature(input: { paymentId: string; subscriptionId: string; signature: string }, keySecret: string): boolean {
  if (!input.paymentId || !input.subscriptionId || !input.signature) return false;
  return safeEqualHex(hmacHex(`${input.paymentId}|${input.subscriptionId}`, keySecret), input.signature);
}

/** Checks a webhook: the HMAC-SHA256 of the exact raw body, with the webhook secret. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined, webhookSecret: string): boolean {
  if (!signature || !webhookSecret) return false;
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}

/**
 * The plan status for a Razorpay subscription. Anything unknown fails closed
 * (no access). A subscription whose first charge is still in the future and
 * whose payment mandate is approved is the free trial.
 */
export function mapSubscriptionStatus(sub: Pick<RazorpaySubscription, 'status' | 'start_at'>, nowMs: number): SubscriptionStatus {
  switch (sub.status) {
    case 'authenticated':
      return sub.start_at && sub.start_at * 1000 > nowMs ? 'trialing' : 'incomplete';
    case 'active':
      return 'active';
    case 'pending':   // a charge failed and Razorpay is retrying
    case 'halted':    // retries ran out
    case 'paused':
      return 'past_due';
    case 'cancelled':
    case 'completed':
    case 'expired':
      return 'canceled';
    default:          // 'created' (checkout not finished) and anything new
      return 'incomplete';
  }
}

/** Raw statuses that mean the customer has approved a payment mandate, so the free trial is used. */
const TRIAL_USED_STATUSES = new Set(['authenticated', 'active', 'pending', 'halted', 'paused', 'completed']);

/** The billing fields a Razorpay subscription decides. Never sets `trialUsed` back to false. */
export function billingFromSubscription(sub: RazorpaySubscription, nowMs: number): Pick<BillingInfo, 'razorpaySubscriptionId' | 'status' | 'currentPeriodEnd'> & Partial<Pick<BillingInfo, 'trialUsed' | 'cancelScheduled'>> {
  const status = mapSubscriptionStatus(sub, nowMs);
  return {
    razorpaySubscriptionId: sub.id,
    status,
    // While trialing, the period ends when the first charge is taken.
    currentPeriodEnd: status === 'trialing' ? (sub.start_at ?? null) : (sub.current_end ?? sub.charge_at ?? null),
    ...(TRIAL_USED_STATUSES.has(sub.status) && { trialUsed: true }),
    ...(status === 'canceled' && { cancelScheduled: false }),
  };
}

/** The uid the subscription was created for, if it carries one. */
export function uidFromNotes(sub: Pick<RazorpaySubscription, 'notes'>): string | null {
  const notes = sub.notes;
  if (!notes || Array.isArray(notes)) return null;
  const uid = (notes as Record<string, unknown>).uid;
  return typeof uid === 'string' && uid ? uid : null;
}
