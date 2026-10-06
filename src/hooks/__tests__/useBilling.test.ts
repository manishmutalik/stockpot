import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { useBilling, loadRazorpayCheckout } from '../useBilling';

const reply = (body: any, ok = true) => ({ ok, json: async () => body });
const STATUS = { status: 'none', currentPeriodEnd: null, trialUsed: false, cancelScheduled: false, paywall: false };

/** A stand-in for Razorpay's popup that records its options so the test can finish or dismiss the payment. */
function stubRazorpay() {
  const opened: any[] = [];
  const open = vi.fn();
  (window as any).Razorpay = class { constructor(public options: any) { opened.push(options); } open = open; };
  return { opened, open };
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue(reply(STATUS));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { delete (window as any).Razorpay; vi.restoreAllMocks(); });

const mount = (showAlert = vi.fn()) => ({ showAlert, ...renderHook(() => useBilling(true, showAlert)) });

describe('useBilling', () => {
  it('loads the plan status and says whether it gives access', async () => {
    apiFetch.mockResolvedValue(reply({ ...STATUS, status: 'trialing', currentPeriodEnd: 99 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    expect(result.current.billing.status).toBe('trialing');
    expect(result.current.hasAccess).toBe(true);
  });

  it('reports whether the server says this account needs a plan', async () => {
    apiFetch.mockResolvedValue(reply({ ...STATUS, paywall: true }));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    expect(result.current.billing.paywall).toBe(true);
    expect(result.current.hasAccess).toBe(false);
  });

  it('assumes no paywall when the status cannot be read', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    expect(result.current.billing.paywall).toBe(false);
  });

  it('opens Razorpay Checkout with the subscription the server made, and prefilled email', async () => {
    const { opened, open } = stubRazorpay();
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    apiFetch.mockResolvedValueOnce(reply({ keyId: 'rzp_test_1', subscriptionId: 'sub_1', trial: true, trialDays: 45 }));

    await act(async () => { await result.current.startCheckout('asha@example.com'); });

    expect(apiFetch).toHaveBeenLastCalledWith('/api/billing/create-subscription', { method: 'POST' });
    expect(open).toHaveBeenCalledTimes(1);
    expect(opened[0]).toMatchObject({ key: 'rzp_test_1', subscription_id: 'sub_1', prefill: { email: 'asha@example.com' } });
    expect(opened[0].description).toContain('45-day free trial');
    expect(result.current.isStartingCheckout).toBe(true);
  });

  it('sends the proof of payment to the server and takes the plan from its answer', async () => {
    const { opened } = stubRazorpay();
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    apiFetch.mockResolvedValueOnce(reply({ keyId: 'k', subscriptionId: 'sub_1', trial: true, trialDays: 45 }));
    await act(async () => { await result.current.startCheckout(); });

    const proof = { razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_1', razorpay_signature: 'sig' };
    apiFetch.mockResolvedValueOnce(reply({ status: 'trialing', currentPeriodEnd: 99, trialUsed: true, cancelScheduled: false }));
    await act(async () => { await opened[0].handler(proof); });

    const [url, init] = apiFetch.mock.calls.at(-1)!;
    expect(url).toBe('/api/billing/verify-payment');
    expect(JSON.parse(init.body)).toEqual(proof);
    expect(result.current.billing.status).toBe('trialing');
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.isStartingCheckout).toBe(false);
  });

  it('tells the user when the payment is still being confirmed, rather than unlocking', async () => {
    const { opened } = stubRazorpay();
    const { result, showAlert } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    apiFetch.mockResolvedValueOnce(reply({ keyId: 'k', subscriptionId: 'sub_1', trial: false, trialDays: 45 }));
    await act(async () => { await result.current.startCheckout(); });
    apiFetch.mockResolvedValueOnce(reply({ status: 'incomplete', currentPeriodEnd: null, trialUsed: false, cancelScheduled: false }));
    await act(async () => { await opened[0].handler({ razorpay_payment_id: 'p', razorpay_subscription_id: 's', razorpay_signature: 'x' }); });
    expect(result.current.hasAccess).toBe(false);
    expect(showAlert).toHaveBeenCalledWith('Confirming Your Payment', expect.stringContaining('being confirmed'));
  });

  it('puts the button back when the popup is closed without paying', async () => {
    const { opened } = stubRazorpay();
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    apiFetch.mockResolvedValueOnce(reply({ keyId: 'k', subscriptionId: 'sub_1', trial: true, trialDays: 45 }));
    await act(async () => { await result.current.startCheckout(); });
    expect(result.current.isStartingCheckout).toBe(true);
    act(() => { opened[0].modal.ondismiss(); });
    expect(result.current.isStartingCheckout).toBe(false);
  });

  it('shows the server\'s reason and opens nothing when the subscription cannot be started', async () => {
    const { open } = stubRazorpay();
    const { result, showAlert } = mount();
    await waitFor(() => expect(result.current.isLoadingBilling).toBe(false));
    apiFetch.mockResolvedValueOnce(reply({ error: 'You already have an active subscription.' }, false));
    await act(async () => { await result.current.startCheckout(); });
    expect(open).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Couldn\'t Start Checkout', 'You already have an active subscription.');
    expect(result.current.isStartingCheckout).toBe(false);
  });

  it('cancels, and shows the plan as it now stands', async () => {
    apiFetch.mockResolvedValue(reply({ ...STATUS, status: 'active', currentPeriodEnd: 99 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.billing.status).toBe('active'));
    apiFetch.mockResolvedValueOnce(reply({ status: 'active', currentPeriodEnd: 99, trialUsed: true, cancelScheduled: true }));
    await act(async () => { await result.current.cancelSubscription(); });
    expect(apiFetch).toHaveBeenLastCalledWith('/api/billing/cancel', { method: 'POST' });
    expect(result.current.billing.cancelScheduled).toBe(true);
    expect(result.current.isCancelling).toBe(false);
  });

  it('keeps the plan and says why when cancelling fails', async () => {
    apiFetch.mockResolvedValue(reply({ ...STATUS, status: 'active' }));
    const { result, showAlert } = mount();
    await waitFor(() => expect(result.current.billing.status).toBe('active'));
    apiFetch.mockResolvedValueOnce(reply({ error: 'No subscription found.' }, false));
    await act(async () => { await result.current.cancelSubscription(); });
    expect(showAlert).toHaveBeenCalledWith('Couldn\'t Cancel', 'No subscription found.');
    expect(result.current.billing.status).toBe('active');
  });
});

describe('loadRazorpayCheckout', () => {
  it('loads Razorpay\'s script only when asked, and can be retried after a failure', async () => {
    delete (window as any).Razorpay;
    const before = document.head.querySelectorAll('script[src*="checkout.razorpay.com"]').length;
    const first = loadRazorpayCheckout();
    const el = document.head.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]') as HTMLScriptElement;
    expect(el).toBeTruthy();
    expect(before).toBe(0);
    el.onerror?.(new Event('error'));
    await expect(first).rejects.toThrow(/payment window/);
    expect(document.head.querySelector('script[src*="checkout.razorpay.com"]')).toBeNull();

    // A second try adds the script again instead of reusing the failed one.
    const second = loadRazorpayCheckout();
    const el2 = document.head.querySelector('script[src*="checkout.razorpay.com"]') as HTMLScriptElement;
    expect(el2).toBeTruthy();
    el2.onload?.(new Event('load'));
    await expect(second).resolves.toBeUndefined();
    el2.remove();
  });
});
