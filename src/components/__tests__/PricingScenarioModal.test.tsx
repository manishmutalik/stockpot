import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PricingScenarioModal, breakEvenSentence } from '../PricingScenarioModal';
import { stampFor } from '../../utils/orderPricing';

const TODAY = '2026-10-05';
const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' }];
const cake: any = { id: 'cake', name: 'Cake', emoji: '🎂', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 1250, unit: 'g' }] }; // cost 50
const rusk: any = { id: 'rusk', name: 'Rusk', sellingPrice: 40, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }; // cost 20
const free: any = { id: 'free', name: 'Unpriced', sellingPrice: 0, recipe: [] };
const order = (date: string, qty: number, item: any): any => ({ id: `${item.id}-${date}`, menuItemId: item.id, quantity: qty, date, ...stampFor(item, materials) });
const orders = [order('2026-06-01', 1, rusk), order('2026-09-20', 100, cake)];

const show = (over: Record<string, any> = {}) => {
  const onClose = vi.fn();
  render(<PricingScenarioModal menu={[cake, rusk, free]} orders={orders} materials={materials} settings={{} as any} today={TODAY} currencySymbol="₹" onClose={onClose} {...over} />);
  return { onClose };
};

describe('breakEvenSentence', () => {
  it('words each case plainly', () => {
    expect(breakEvenSentence({ type: 'can_lose', pct: 7 }, 30)).toBe('You could lose up to 7.0% of these sales and still make the same profit as today.');
    expect(breakEvenSentence({ type: 'must_gain', pct: 12.5 }, 30)).toBe('At these prices you would need 12.5% more sales to make the same profit as today.');
    expect(breakEvenSentence({ type: 'unchanged' }, 30)).toBe('These prices make the same profit as today.');
    expect(breakEvenSentence({ type: 'not_applicable' }, 30)).toMatch(/not enough sales in the last 30 days/);
  });
});

describe('PricingScenarioModal', () => {
  it('starts at +8% on every priced item, and leaves unpriced items out', () => {
    show();
    expect((screen.getByLabelText('Change prices by (%)') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('New price for Cake') as HTMLInputElement).value).toBe('108');
    expect((screen.getByLabelText('New price for Rusk') as HTMLInputElement).value).toBe('43.2');
    expect(screen.queryByLabelText('Include Unpriced')).toBeNull();
  });

  it('shows monthly contribution now and after, and a break-even that says how many sales could be lost', () => {
    show();
    const result = screen.getByRole('status', { name: 'Result' });
    // cake: 100 units a month at ₹50 each = 5,000 now; at ₹108 it is ₹58 a unit = 5,800
    expect(result.textContent).toMatch(/₹5,000\.00 → ₹5,800\.00/);
    expect(result.textContent).toMatch(/\+₹800\.00/);
    expect(result.textContent).toMatch(/You could lose up to 13\.8% of these sales/); // 1 - 5000/5800
  });

  it('recomputes when the percentage changes, and lets a single price be overridden', () => {
    show();
    fireEvent.change(screen.getByLabelText('Change prices by (%)'), { target: { value: '20' } });
    expect((screen.getByLabelText('New price for Cake') as HTMLInputElement).value).toBe('120');
    expect(screen.getByRole('status', { name: 'Result' }).textContent).toMatch(/₹5,000\.00 → ₹7,000\.00/);
    fireEvent.change(screen.getByLabelText('New price for Cake'), { target: { value: '110' } });
    expect(screen.getByRole('status', { name: 'Result' }).textContent).toMatch(/₹5,000\.00 → ₹6,000\.00/);
  });

  it('says "No recent sales" for an item with none, never 0% impact', () => {
    show();
    const row = screen.getByLabelText('Include Rusk').closest('tr')!;
    expect(within(row).getAllByText('No recent sales').length).toBeGreaterThan(0);
  });

  it('says a price cut needs more sales', () => {
    show();
    fireEvent.change(screen.getByLabelText('Change prices by (%)'), { target: { value: '-20' } });
    expect(screen.getByRole('status', { name: 'Result' }).textContent).toMatch(/you would need 66\.7% more sales/);
  });

  it('applies the owner\'s volume guess to the result', () => {
    show();
    fireEvent.change(screen.getByLabelText('If sales change by (%, optional)'), { target: { value: '-10' } });
    expect(screen.getByRole('status', { name: 'Result' }).textContent).toMatch(/₹5,000\.00 → ₹5,220\.00/); // 5,800 x 0.9
  });

  it('only counts the items ticked, and can select or clear them all', () => {
    show();
    fireEvent.click(screen.getByLabelText('Include Cake'));
    expect(screen.getByRole('status', { name: 'Result' }).textContent).toMatch(/not enough sales/);
    fireEvent.click(screen.getByText('Select all'));
    expect((screen.getByLabelText('Include Cake') as HTMLInputElement).checked).toBe(true);
  });

  it('states what Stockpot cannot know and that fixed costs do not move', () => {
    show();
    expect(screen.getByText(/Fixed costs do not change with price/)).toBeTruthy();
    expect(screen.getByText(/cannot know how customers will react/)).toBeTruthy();
  });

  it('asks for a price first when nothing is priced', () => {
    show({ menu: [free] });
    expect(screen.getByText(/Set a price on a menu item first/)).toBeTruthy();
  });
});
