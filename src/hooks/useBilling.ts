/**
 * useBilling.ts
 *
 * Fetches the current user's subscription status from the server
 * (`/api/billing/status`, which reads server-controlled Firestore data —
 * the client can never write its own "active" status) and exposes actions
 * to start a subscription with Razorpay Checkout and to cancel it.
 *
 * Checkout runs in a Razorpay popup over the app, so the user never leaves it.
 * When the popup reports a payment, the proof is sent to the server, which
 * checks it and reads the subscription's real state from Razorpay.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiClient';

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface BillingInfo {
  status: SubscriptionStatus;
  /** Unix seconds: when the trial ends or the current period renews or ends. */
  currentPeriodEnd: number | null;
  /** A payment mandate was approved before, so there is no second free trial. */
  trialUsed: boolean;
  /** Ends at the end of the period already paid for. */
  cancelScheduled: boolean;
}

const DEFAULT_BILLING: BillingInfo = {
  status: 'none',
  currentPeriodEnd: null,
  trialUsed: false,
  cancelScheduled: false,
};

export function hasActiveAccess(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

interface CheckoutResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: { email?: string };
  theme?: { color: string };
  handler: (response: CheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let checkoutScript: Promise<void> | null = null;

/** Loads Razorpay's checkout script once, only when someone starts a subscription. */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = CHECKOUT_SCRIPT;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { checkoutScript = null; el.remove(); reject(new Error('Could not load the payment window. Check your connection and try again.')); };
    document.head.appendChild(el);
  });
  return checkoutScript;
}

export function useBilling(authReady: boolean, showAlert: (title: string, message: string) => void) {
  const [billing, setBilling] = useState<BillingInfo>(DEFAULT_BILLING);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const refreshBilling = useCallback(async () => {
    try {
      const res = await apiFetch('/api/billing/status');
      if (res.ok) setBilling({ ...DEFAULT_BILLING, ...(await res.json()) });
    } catch (err) {
      console.error('Failed to fetch billing status', err);
    } finally {
      setIsLoadingBilling(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    refreshBilling();
  }, [authReady, refreshBilling]);

  /** Sends Razorpay's proof of a finished payment to the server, which checks it. */
  const confirmPayment = useCallback(async (response: CheckoutResponse) => {
    try {
      const res = await apiFetch('/api/billing/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm your payment');
      setBilling({ ...DEFAULT_BILLING, ...data });
      if (!hasActiveAccess(data.status)) {
        showAlert('Confirming Your Payment', 'Your payment went through and is being confirmed. This usually takes a minute — reload the app if it does not unlock.');
      }
    } catch (err: any) {
      console.error('Failed to confirm payment', err);
      showAlert('Couldn\'t Confirm Your Payment', err.message || 'Your payment may have gone through. Reload the app in a minute; if you are still locked out, contact support.');
    } finally {
      setIsStartingCheckout(false);
    }
  }, [showAlert]);

  /** Opens Razorpay Checkout to start (or restart) a subscription. */
  const startCheckout = useCallback(async (email?: string) => {
    setIsStartingCheckout(true);
    try {
      const res = await apiFetch('/api/billing/create-subscription', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error('The payment window did not load. Please try again.');
      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'Stockpot',
        description: data.trial ? `${data.trialDays}-day free trial, then monthly` : 'Monthly subscription',
        prefill: email ? { email } : undefined,
        theme: { color: '#00797B' },
        handler: confirmPayment,
        // Closing the window without paying leaves the user where they were.
        modal: { ondismiss: () => setIsStartingCheckout(false) },
      });
      checkout.open();
    } catch (err: any) {
      console.error('Failed to start checkout', err);
      showAlert('Couldn\'t Start Checkout', err.message || 'Something went wrong starting checkout. Please try again, or contact support if this keeps happening.');
      setIsStartingCheckout(false);
    }
  }, [showAlert, confirmPayment]);

  /** Cancels the subscription: a paying one ends with its period, a trial ends at once. */
  const cancelSubscription = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await apiFetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel your subscription');
      setBilling({ ...DEFAULT_BILLING, ...data });
    } catch (err: any) {
      console.error('Failed to cancel subscription', err);
      showAlert('Couldn\'t Cancel', err.message || 'Something went wrong cancelling. Please try again, or contact support if this keeps happening.');
    } finally {
      setIsCancelling(false);
    }
  }, [showAlert]);

  return {
    billing,
    isLoadingBilling,
    hasAccess: hasActiveAccess(billing.status),
    refreshBilling,
    startCheckout,
    isStartingCheckout,
    cancelSubscription,
    isCancelling,
  };
}
