/**
 * useBilling.ts
 *
 * Fetches the current user's subscription status from the server
 * (`/api/billing/status`, which reads server-controlled Firestore data —
 * the client can never write its own "active" status) and exposes actions
 * to start a Stripe Checkout session or open the Stripe Billing Portal.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiClient';

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface BillingInfo {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: number | null;
  updatedAt: number;
}

const DEFAULT_BILLING: BillingInfo = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: 'none',
  currentPeriodEnd: null,
  updatedAt: 0,
};

export function hasActiveAccess(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function useBilling(authReady: boolean, showAlert: (title: string, message: string) => void) {
  const [billing, setBilling] = useState<BillingInfo>(DEFAULT_BILLING);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const refreshBilling = useCallback(async () => {
    try {
      const res = await apiFetch('/api/billing/status');
      if (res.ok) setBilling(await res.json());
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

  /** Redirects to Stripe Checkout to start (or restart) a subscription. */
  const startCheckout = useCallback(async (email?: string) => {
    setIsStartingCheckout(true);
    try {
      const res = await apiFetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      console.error('Failed to start checkout', err);
      showAlert('Couldn\'t Start Checkout', err.message || 'Something went wrong starting checkout. Please try again, or contact support if this keeps happening.');
      setIsStartingCheckout(false);
    }
  }, [showAlert]);

  /** Redirects to the Stripe Billing Portal to manage/cancel the subscription. */
  const openBillingPortal = useCallback(async () => {
    setIsOpeningPortal(true);
    try {
      const res = await apiFetch('/api/billing/create-portal-session', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open billing portal');
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      console.error('Failed to open billing portal', err);
      showAlert('Couldn\'t Open Billing', err.message || 'Something went wrong opening billing management. Please try again, or contact support if this keeps happening.');
      setIsOpeningPortal(false);
    }
  }, [showAlert]);

  return {
    billing,
    isLoadingBilling,
    hasAccess: hasActiveAccess(billing.status),
    refreshBilling,
    startCheckout,
    isStartingCheckout,
    openBillingPortal,
    isOpeningPortal,
  };
}
