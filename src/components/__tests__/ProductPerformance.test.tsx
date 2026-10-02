import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProductPerformance } from '../ProductPerformance';
import type { ProductProfit } from '../../utils/profit';
import type { MarginTier } from '../../utils/menuStats';

const money = (n: number) => `₹${n.toFixed(2)}`;
const profit = (over: Partial<ProductProfit> = {}): ProductProfit => ({
  menuItemId: 'cake', unitsSold: 40, orderCount: 12, revenue: 6000, contribution: 4200, avgContributionPerUnit: 105, estimated: false, ...over,
});
const healthy: { tier: MarginTier; margin: number } = { tier: 'high', margin: 70 };
const show = (p: ProductProfit | undefined, recipe = healthy) =>
  render(<ProductPerformance name="Cake" profit={p} recipe={recipe} money={money} periodLabel="in the last 30 days" />);

describe('ProductPerformance', () => {
  it('shows units sold, revenue, what it made and what that is per unit', () => {
    show(profit());
    const g = within(screen.getByRole('group', { name: 'Sales of Cake' }));
    expect(g.getByText('40 units')).toBeTruthy();
    expect(g.getByText('₹6000.00')).toBeTruthy();
    expect(g.getByText('₹4200.00')).toBeTruthy();
    expect(g.getByText(/₹105\.00/)).toBeTruthy();
    expect(g.getByText('70% kept')).toBeTruthy();
  });

  it('says one unit, not one units', () => {
    show(profit({ unitsSold: 1 }));
    expect(screen.getByText('1 unit')).toBeTruthy();
  });

  it('says there were no sales in the period', () => {
    show(undefined);
    expect(screen.getByText('No sales in the last 30 days.')).toBeTruthy();
    show(profit({ unitsSold: 0 }));
    expect(screen.getAllByText('No sales in the last 30 days.')).toHaveLength(2);
  });

  it('flags a product whose healthy recipe margin is eaten away by discounts, fees and delivery', () => {
    show(profit({ contribution: 2400, avgContributionPerUnit: 60 })); // keeps 40% of sales against a 70% recipe margin
    expect(screen.getByText(/recipe margin is 70%, but only 40% of sales is kept/)).toBeTruthy();
  });

  it('does not flag a product that keeps what its recipe says, or one whose recipe margin was never high', () => {
    show(profit());
    expect(screen.queryByText(/eating into it/)).toBeNull();
    show(profit({ contribution: 2400 }), { tier: 'mid', margin: 50 });
    expect(screen.queryByText(/eating into it/)).toBeNull();
  });

  it('shows a loss as a loss', () => {
    show(profit({ contribution: -300, avgContributionPerUnit: -7.5 }));
    expect(screen.getByText('loss')).toBeTruthy();
    expect(screen.getByText('-₹300.00')).toBeTruthy();
  });

  it('marks an estimate', () => {
    show(profit({ estimated: true }));
    expect(screen.getByText('est.')).toBeTruthy();
  });
});
