import { describe, it, expect, vi } from 'vitest';
import { CLAIM_PATH, PAYMENT_SETUP_PATH, paymentSetupLines, claimLine, claimWhen, ordersLabel, recordPaymentText, requestStatement, reviewClaim, sendLabel, STATEMENT_PATH, waitingLabel, waitingTone } from '../paymentsDue';

describe('paymentsDue', () => {
  it('asks for one customer\'s statement by their key', async () => {
    const answer = { customerName: 'Priya', orderIds: ['a', 'b'], balanceDue: 1300, shareMessage: 'x', whatsappUrl: null };
    const api = { post: vi.fn().mockResolvedValue(answer) };
    await expect(requestStatement(api, 'phone:9876543210')).resolves.toEqual(answer);
    expect(api.post).toHaveBeenCalledWith(STATEMENT_PATH, { customerKey: 'phone:9876543210' });
    expect(STATEMENT_PATH).toBe('/api/mobile/payments/statement');
  });

  it('lets the failure through, for the button to explain', async () => {
    await expect(requestStatement({ post: vi.fn().mockRejectedValue(new Error('offline')) }, 'k')).rejects.toThrow('offline');
  });

  it('says how long they have waited, and from when it is worth a nudge', () => {
    expect([0, 1, 2, 12].map(waitingLabel)).toEqual(['Today', '1 day', '2 days', '12 days']);
    expect(waitingLabel(-3)).toBe('Today');
    expect([0, 6, 7, 13, 14, 40].map(waitingTone)).toEqual(['grey', 'grey', 'amber', 'amber', 'coral', 'coral']);
  });

  it('offers an invoice for one order and a statement for several', () => {
    expect(sendLabel({ orderCount: 1 })).toBe('Send invoice');
    expect(sendLabel({ orderCount: 2 })).toBe('Send statement');
    expect([1, 3].map(ordersLabel)).toEqual(['1 order', '3 orders']);
  });

  it('starts the Payment screen with what they owe, or empty when the customer has no name', () => {
    expect(recordPaymentText({ name: 'Priya', dueTotal: 1300 })).toBe('Priya paid 1300');
    expect(recordPaymentText({ name: 'Priya', dueTotal: 1300.5 })).toBe('Priya paid 1300.5');
    expect(recordPaymentText({ name: 'Customer not named', dueTotal: 900 })).toBe('');
  });
});

describe('a customer\'s "I have paid by UPI"', () => {
  const IST = 330;
  const at = Date.parse('2026-10-06T08:45:00Z'); // 2:15 pm in India
  const INR = { code: 'INR', symbol: '₹' };

  it('says when, in the phone\'s own time', () => {
    expect(claimWhen(at, at + 60_000, IST)).toBe('today, 2:15 pm');
    expect(claimWhen(at, at + 24 * 3_600_000, IST)).toBe('yesterday, 2:15 pm');
    expect(claimWhen(at, at + 3 * 24 * 3_600_000, IST)).toBe('6 Oct');
    // 11:30 pm on the 5th in India is still the 5th there, though it is the 5th at 6 pm in UTC too
    expect(claimWhen(Date.parse('2026-10-05T18:00:00Z'), at, IST)).toBe('yesterday, 11:30 pm');
  });

  it('says what they claimed, and for how many orders when it is not all of them', () => {
    const claim = { at, amount: 900, orderCount: 1 };
    expect(claimLine(claim, { orderCount: 1 }, INR, at + 60_000)).toMatch(/^Says they paid ₹900 by UPI · today, /);
    expect(claimLine(claim, { orderCount: 3 }, INR, at + 60_000)).toMatch(/^Says they paid ₹900 by UPI for 1 order · /);
  });

  it('confirms or dismisses it under one idempotency key per tap', async () => {
    const answer = { customerName: 'Priya', action: 'confirm', orderIds: ['p1'], amount: 900, remainingDue: 0 };
    const api = { post: vi.fn().mockResolvedValue(answer) };
    await expect(reviewClaim(api, 'phone:9876543210', 'confirm', 'key-0001')).resolves.toEqual(answer);
    expect(api.post).toHaveBeenCalledWith(CLAIM_PATH, { customerKey: 'phone:9876543210', action: 'confirm' }, { idempotencyKey: 'key-0001' });
    expect(CLAIM_PATH).toBe('/api/mobile/payments/claim');
  });
});

describe('how customers can pay, for Settings', () => {
  it('says what is on and where to set up what is not', () => {
    expect(PAYMENT_SETUP_PATH).toBe('/api/mobile/payment-setup');
    const off = paymentSetupLines({ upi: false, online: null });
    expect(off.map(l => l.on)).toEqual([false, false]);
    expect(off[0].detail).toContain('Add your UPI ID');
    expect(off[1].detail).toContain('Razorpay or Cashfree');
    const on = paymentSetupLines({ upi: true, online: { kind: 'gateway', label: 'Razorpay', test: true } });
    expect(on.map(l => l.on)).toEqual([true, true]);
    expect(on[1].detail).toBe('Through your Razorpay account (test keys: no real money moves). Paid bills are marked paid by themselves.');
    expect(paymentSetupLines({ upi: true, online: { kind: 'link' } })[1].detail).toContain('payment link');
  });
});
