import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ContributionBreakdown, MadeBadge } from '../ContributionBreakdown';

const money = (n: number) => `₹${n.toFixed(2)}`;
const base: any = {
  itemsRevenue: 300, deliveryCharged: 0, discount: 0, gstOnSale: 0, ingredients: 90, packaging: 0, courierFee: 0, paymentFee: 0,
  inputGst: 0, customerPays: 300, contribution: 210, estimated: false,
};

describe('MadeBadge', () => {
  it('says what was made and toggles the breakdown', () => {
    const onToggle = vi.fn();
    render(<MadeBadge contribution={base} money={money} open={false} onToggle={onToggle} />);
    const badge = screen.getByRole('button', { name: 'Made ₹210.00. Show breakdown' });
    expect(badge.textContent).toContain('Made ₹210.00');
    fireEvent.click(badge);
    expect(onToggle).toHaveBeenCalled();
  });

  it('says Lost, with the amount as a positive number, when the order lost money', () => {
    render(<MadeBadge contribution={{ ...base, contribution: -25 }} money={money} open={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Lost ₹25.00. Show breakdown' })).toBeTruthy();
  });

  it('flags an estimate', () => {
    render(<MadeBadge contribution={{ ...base, estimated: true }} money={money} open={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /\(estimated\)/ })).toBeTruthy();
    expect(screen.getByText('est.')).toBeTruthy();
  });
});

describe('ContributionBreakdown', () => {
  const group = () => screen.getByRole('group', { name: 'How this was worked out' });

  it('lists the revenue and costs and what was made, leaving out lines that are zero', () => {
    render(<ContributionBreakdown contribution={base} money={money} gstOn={false} />);
    const g = within(group());
    expect(g.getByText('Items')).toBeTruthy();
    expect(g.getByText('Ingredients')).toBeTruthy();
    expect(g.getByText('Made on this order')).toBeTruthy();
    for (const hidden of ['Delivery charged', 'Discount', 'Packaging', 'Courier fee', 'Payment fee']) expect(g.queryByText(hidden)).toBeNull();
  });

  it('shows discount, courier and payment fee when there are some', () => {
    render(<ContributionBreakdown contribution={{ ...base, deliveryCharged: 40, discount: 20, packaging: 10, courierFee: 30, paymentFee: 6 }} money={money} gstOn={false} />);
    const g = within(group());
    for (const shown of ['Delivery charged', 'Discount', 'Packaging', 'Courier fee', 'Payment fee']) expect(g.getByText(shown)).toBeTruthy();
    expect(g.getByText('-₹20.00')).toBeTruthy();
  });

  it('says Lost on this order for a loss', () => {
    render(<ContributionBreakdown contribution={{ ...base, contribution: -5 }} money={money} gstOn={false} />);
    expect(within(group()).getByText('Lost on this order')).toBeTruthy();
  });

  it('explains GST only when GST is on and there is some', () => {
    const { rerender } = render(<ContributionBreakdown contribution={{ ...base, gstOnSale: 54 }} money={money} gstOn={true} />);
    expect(screen.getByText(/GST of ₹54.00/)).toBeTruthy();
    rerender(<ContributionBreakdown contribution={{ ...base, gstOnSale: 54 }} money={money} gstOn={false} />);
    expect(screen.queryByText(/GST of/)).toBeNull();
  });

  it('explains an estimate', () => {
    render(<ContributionBreakdown contribution={{ ...base, estimated: true }} money={money} gstOn={false} />);
    expect(screen.getByText(/Estimated: this order was made before/)).toBeTruthy();
  });
});
