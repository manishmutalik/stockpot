import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PendingPayments } from '../PendingPayments';
import { claimedOrderIds, type PendingCustomer } from '../../utils/payments';

const money = (n: number) => `₹${n}`;
const claim = { at: Date.parse('2026-10-06T08:45:00Z'), amount: 900, method: 'upi' as const };
const customer = (orders: any[]): PendingCustomer => ({ key: 'phone:9876543210', name: 'Priya', phone: '98765 43210', orders, orderCount: 2, oldestDate: '2026-10-01', dueTotal: 1300 });

describe('PendingPayments: a customer who says they paid by UPI', () => {
  it('shows the claim with Confirm received and Not received, for the orders it covers', () => {
    const onConfirmClaim = vi.fn();
    const onDismissClaim = vi.fn();
    const c = customer([
      { id: 'p1', date: '2026-10-01', paymentClaim: claim },
      { id: 'p2', date: '2026-10-03' },
    ]);
    render(<PendingPayments customers={[c]} money={money} onStatement={vi.fn()} onMarkPaid={vi.fn()} onConfirmClaim={onConfirmClaim} onDismissClaim={onDismissClaim} />);
    expect(screen.getByRole('status').textContent).toContain('Says they paid ₹900 by UPI');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }));
    expect(onConfirmClaim).toHaveBeenCalledWith(c, ['p1'], 900);
    fireEvent.click(screen.getByRole('button', { name: 'Not received' }));
    expect(onDismissClaim).toHaveBeenCalledWith(['p1']);
  });

  it('says nothing for a customer with no claim', () => {
    render(<PendingPayments customers={[customer([{ id: 'p1', date: '2026-10-01', paymentClaim: null }])]} money={money} onStatement={vi.fn()} onMarkPaid={vi.fn()} onConfirmClaim={vi.fn()} onDismissClaim={vi.fn()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('takes a claimed multi-item order whole', () => {
    expect(claimedOrderIds([
      { id: 'a', orderGroupId: 'g', paymentClaim: claim },
      { id: 'b', orderGroupId: 'g' },
      { id: 'c' },
    ])).toEqual(['a', 'b']);
  });
});
