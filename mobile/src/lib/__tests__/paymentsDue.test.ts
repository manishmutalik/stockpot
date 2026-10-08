import { describe, it, expect, vi } from 'vitest';
import { ordersLabel, recordPaymentText, requestStatement, sendLabel, STATEMENT_PATH, waitingLabel, waitingTone } from '../paymentsDue';

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
