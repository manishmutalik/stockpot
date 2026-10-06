/**
 * billingRoutes.ts
 *
 * Express handlers for subscriptions, with their dependencies injected so they
 * can be tested without Firebase or Razorpay. Wired up in server.ts.
 *
 * The flow: the app asks for a subscription (`create`), opens Razorpay Checkout
 * with it, and on success posts the proof back (`verify`). The webhook is the
 * long-term source of truth for renewals, failed charges and cancellations.
 * Whoever calls, the plan status is always worked out from the subscription
 * Razorpay holds, never from what the browser says.
 */
import type { Request, Response } from 'express';
import type { AuthedRequest } from './auth';
import {
  billingFromSubscription, readRazorpayConfig, uidFromNotes, verifyPaymentSignature, verifyWebhookSignature,
  RazorpayError, type RazorpayApi, type RazorpayConfig, type RazorpaySubscription,
} from './razorpay';
import { hasActiveAccess, type BillingInfo } from './subscriptionStore';
import { isDemoAccountEmail } from './aiConfig';
import { TRIAL_DAYS } from '../src/utils/trial';

/**
 * Whether this account must have a plan to use the app (the paywall). Off for
 * everyone unless the server turns it on, so deploying billing changes nothing
 * until then:
 *  - BILLING_ENFORCED=true: every account (the launch switch).
 *  - BILLING_ENFORCED_EMAILS=a@x.com,b@y.com: only these accounts, so the whole
 *    flow can be tried on a live site with Razorpay Test Mode while everyone
 *    else is unaffected. The email must be verified, as for the AI allow-list.
 * Never on for demo accounts, while the testing switch BILLING_DISABLED=true is
 * on, or when Razorpay is not configured (a paywall that cannot take payment
 * would only lock people out).
 */
export function paywallApplies(account: { email?: string; emailVerified?: boolean }, env: Record<string, string | undefined> = process.env): boolean {
  if (env.BILLING_DISABLED === 'true') return false;
  if (isDemoAccountEmail(account.email)) return false;
  if (!readRazorpayConfig(env)) return false;
  if (env.BILLING_ENFORCED === 'true') return true;
  const listed = (env.BILLING_ENFORCED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return !!account.email && !!account.emailVerified && listed.includes(account.email.toLowerCase());
}

export interface BillingRouteDeps {
  /** True while the temporary BILLING_DISABLED testing switch is on. */
  billingDisabled: () => boolean;
  /** Null when billing is not set up on this server. */
  config: () => RazorpayConfig | null;
  api: (config: RazorpayConfig) => RazorpayApi;
  store: {
    get: (uid: string) => Promise<BillingInfo>;
    set: (uid: string, patch: Partial<BillingInfo>) => Promise<void>;
    findUidBySubscriptionId: (subscriptionId: string) => Promise<string | null>;
  };
  now: () => number;
}

const NOT_CONFIGURED = 'Billing is not configured on this server.';
const DISABLED = 'Billing is temporarily disabled for testing.';

/** What the app may show about the plan. Never includes anything it cannot already read. */
const publicBilling = (b: BillingInfo) => ({
  status: b.status, currentPeriodEnd: b.currentPeriodEnd, trialUsed: b.trialUsed, cancelScheduled: b.cancelScheduled,
});

/** The "temporarily active" answer given while billing is switched off for testing. */
export const DISABLED_BILLING_STATUS = (nowMs: number): BillingInfo => ({
  razorpaySubscriptionId: null, status: 'active', currentPeriodEnd: null, trialUsed: false, cancelScheduled: false, lastEventAt: 0, updatedAt: nowMs,
});

export function createBillingStatusHandler(deps: Pick<BillingRouteDeps, 'billingDisabled' | 'store' | 'now'> & { paywall: (account: { email?: string; emailVerified?: boolean }) => boolean }) {
  return async (req: AuthedRequest, res: Response) => {
    if (deps.billingDisabled()) return res.json({ ...DISABLED_BILLING_STATUS(deps.now()), paywall: false });
    try {
      const info = await deps.store.get(req.uid!);
      // `paywall`: this account must have a plan to use the app.
      return res.json({ ...info, paywall: deps.paywall({ email: req.email, emailVerified: req.emailVerified }) });
    } catch (err: any) {
      console.error('Failed to fetch billing status:', err?.message);
      return res.status(500).json({ error: 'Failed to fetch billing status' });
    }
  };
}

/**
 * POST /billing/create-subscription. Starts a subscription for the signed-in
 * account and returns what Razorpay Checkout needs to open. The first-ever
 * subscription gets the free trial: the payment mandate is approved now and the
 * first charge is taken TRIAL_DAYS later. Anyone who has already used a trial
 * is charged from the start, so cancelling and re-subscribing is not a way to
 * a second free trial.
 */
export function createSubscriptionHandler(deps: BillingRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    if (deps.billingDisabled()) return res.status(400).json({ error: DISABLED });
    const config = deps.config();
    if (!config) return res.status(500).json({ error: NOT_CONFIGURED });

    try {
      const existing = await deps.store.get(req.uid!);
      if (hasActiveAccess(existing.status)) {
        return res.status(409).json({ error: 'You already have an active subscription.' });
      }
      const trial = !existing.trialUsed;
      const startAt = trial ? Math.floor(deps.now() / 1000) + TRIAL_DAYS * 86400 : undefined;

      const sub = await deps.api(config).createSubscription({ planId: config.planId, startAt, uid: req.uid! });
      // Remember this as the account's subscription before Checkout opens, so the webhook can recognise it.
      await deps.store.set(req.uid!, { razorpaySubscriptionId: sub.id });
      return res.json({ keyId: config.keyId, subscriptionId: sub.id, trial, trialDays: TRIAL_DAYS });
    } catch (err: any) {
      console.error('Failed to create subscription:', err?.message);
      return res.status(500).json({ error: 'Failed to start checkout' });
    }
  };
}

/**
 * POST /billing/verify-payment. The browser reports a finished Checkout with the
 * signed proof Razorpay gave it. The proof is checked, then the status is taken
 * from Razorpay's own record of the subscription. The webhook usually says the
 * same a moment later; whichever lands first, the result is the same.
 */
export function createVerifyPaymentHandler(deps: BillingRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    if (deps.billingDisabled()) return res.status(400).json({ error: DISABLED });
    const config = deps.config();
    if (!config) return res.status(500).json({ error: NOT_CONFIGURED });

    const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = req.body ?? {};
    if ([paymentId, subscriptionId, signature].some(v => typeof v !== 'string' || !v)) {
      return res.status(400).json({ error: 'Payment details are missing.' });
    }

    try {
      const existing = await deps.store.get(req.uid!);
      if (existing.razorpaySubscriptionId !== subscriptionId) {
        return res.status(400).json({ error: 'This payment does not belong to your subscription.' });
      }
      if (!verifyPaymentSignature({ paymentId, subscriptionId, signature }, config.keySecret)) {
        return res.status(400).json({ error: 'The payment could not be verified.' });
      }
      const sub = await deps.api(config).getSubscription(subscriptionId);
      await deps.store.set(req.uid!, billingFromSubscription(sub, deps.now()));
      return res.json(publicBilling({ ...existing, ...billingFromSubscription(sub, deps.now()) } as BillingInfo));
    } catch (err: any) {
      console.error('Failed to verify payment:', err?.message);
      return res.status(500).json({ error: 'Failed to confirm your payment' });
    }
  };
}

/**
 * POST /billing/cancel. A paying subscription ends at the end of the period
 * already paid for, so access continues until then. A trial (or anything not yet
 * paying) ends at once, and nothing is ever charged.
 */
export function createCancelHandler(deps: BillingRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    if (deps.billingDisabled()) return res.status(400).json({ error: DISABLED });
    const config = deps.config();
    if (!config) return res.status(500).json({ error: NOT_CONFIGURED });

    try {
      const existing = await deps.store.get(req.uid!);
      if (!existing.razorpaySubscriptionId) {
        return res.status(400).json({ error: 'No subscription found.' });
      }
      const api = deps.api(config);
      const current = await api.getSubscription(existing.razorpaySubscriptionId);
      if (['cancelled', 'completed', 'expired'].includes(current.status)) {
        await deps.store.set(req.uid!, billingFromSubscription(current, deps.now()));
        return res.json(publicBilling({ ...existing, ...billingFromSubscription(current, deps.now()) } as BillingInfo));
      }
      const atCycleEnd = current.status === 'active';
      const after = await api.cancelSubscription(current.id, atCycleEnd);
      const patch = {
        ...billingFromSubscription(after, deps.now()),
        // Cancelling a trial uses it up: it cannot be started again.
        ...(['authenticated', 'active'].includes(current.status) && { trialUsed: true }),
        cancelScheduled: atCycleEnd,
      };
      await deps.store.set(req.uid!, patch);
      return res.json(publicBilling({ ...existing, ...patch } as BillingInfo));
    } catch (err: any) {
      console.error('Failed to cancel subscription:', err?.message);
      const message = err instanceof RazorpayError && err.httpStatus === 400 ? err.message : 'Failed to cancel your subscription';
      return res.status(500).json({ error: message });
    }
  };
}

/**
 * POST /billing/webhook. Razorpay's own report of what happened to a
 * subscription. Registered with `express.raw`, because the signature is over the
 * exact bytes sent. A webhook for a subscription the account has since replaced,
 * or one older than what is already applied, changes nothing.
 */
export function createWebhookHandler(deps: BillingRouteDeps) {
  return async (req: Request, res: Response) => {
    const config = deps.config();
    const secret = config?.webhookSecret;
    if (!secret) {
      console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook not configured');
    }
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') return res.status(400).send('Missing x-razorpay-signature header');
    if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature, secret)) {
      return res.status(400).send('Webhook signature verification failed');
    }

    try {
      const event = JSON.parse((req.body as Buffer).toString('utf8'));
      const sub: RazorpaySubscription | undefined = event?.payload?.subscription?.entity;
      if (typeof event?.event !== 'string' || !event.event.startsWith('subscription.') || !sub?.id) {
        return res.json({ received: true }); // not about a subscription; nothing to do
      }

      const uid = uidFromNotes(sub) ?? await deps.store.findUidBySubscriptionId(sub.id);
      if (!uid) return res.json({ received: true });

      const info = await deps.store.get(uid);
      if (info.razorpaySubscriptionId !== sub.id) return res.json({ received: true }); // a replaced checkout

      const eventAt = typeof event.created_at === 'number' ? event.created_at * 1000 : deps.now();
      if (eventAt < info.lastEventAt) return res.json({ received: true }); // older than what is applied

      await deps.store.set(uid, { ...billingFromSubscription(sub, deps.now()), lastEventAt: eventAt });
      return res.json({ received: true });
    } catch (err: any) {
      console.error('Error processing Razorpay webhook:', err?.message);
      // A 500 makes Razorpay retry; answering 200 would hide a real bug.
      return res.status(500).send('Webhook handler error');
    }
  };
}
