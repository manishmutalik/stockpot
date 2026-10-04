import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReorderSuggestions } from '../ReorderSuggestions';
import type { ReorderResult, ReorderSuggestion } from '../../utils/reorder';

const suggestion = (over: Partial<ReorderSuggestion> = {}): ReorderSuggestion => ({
  materialId: 'flour', name: 'Flour', unit: 'kg', stock: 6, rate: 2, daysOfCover: 3.4, runOutDate: '2026-10-07',
  suggestedQty: 16, flag: 'before_threshold', confidence: 'normal', historyDays: 60, ...over,
});
const result = (suggestions: ReorderSuggestion[] = [], notEnoughHistory: string[] = []): ReorderResult => ({ suggestions, notEnoughHistory });
const names = { flour: 'Flour', butter: 'Butter', sugar: 'Sugar' };
const show = (r: ReorderResult, onRestock = vi.fn()) => { render(<ReorderSuggestions result={r} names={names} onRestock={onRestock} />); return onRestock; };

describe('ReorderSuggestions', () => {
  it('shows nothing when there is nothing to say', () => {
    show(result());
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows what runs out, when, and how much to order, using the unit of the material', () => {
    show(result([suggestion()]));
    const card = screen.getByRole('region', { name: 'Reorder suggestions' });
    expect(within(card).getByText('Flour')).toBeTruthy();
    expect(card.textContent).toContain('About 3 days left');
    expect(card.textContent).toContain('runs out Wed 7 Oct');
    expect(card.textContent).toContain('Order about 16 kg');
    expect(within(card).queryByText('Low confidence')).toBeNull();
    expect(within(card).queryByText('Already low')).toBeNull();
  });

  it('rounds the days down, like the run-out date, and says so for under a day and for none', () => {
    show(result([
      suggestion({ materialId: 'a', name: 'Alpha', daysOfCover: 1.9, stock: 3 }),
      suggestion({ materialId: 'b', name: 'Beta', daysOfCover: 0.4, stock: 1 }),
      suggestion({ materialId: 'c', name: 'Gamma', daysOfCover: 0, stock: 0 }),
    ]));
    expect(screen.getByText(/About 1 day left/)).toBeTruthy();
    expect(screen.getByText(/Less than a day left/)).toBeTruthy();
    expect(screen.getByText(/Out of stock/)).toBeTruthy();
  });

  it('formats quantities like the rest of the app: decimals below a hundred, whole numbers from there, no stray decimals', () => {
    show(result([
      suggestion({ materialId: 'a', name: 'Alpha', suggestedQty: 2.4, unit: 'kg' }),
      suggestion({ materialId: 'b', name: 'Beta', suggestedQty: 1300, unit: 'g' }),
      suggestion({ materialId: 'c', name: 'Gamma', suggestedQty: 24, unit: 'pcs' }),
    ]));
    expect(screen.getByText('2.4 kg')).toBeTruthy();
    expect(screen.getByText('1,300 g')).toBeTruthy();
    expect(screen.getByText('24 pcs')).toBeTruthy();
  });

  it('marks a material the low-stock alert already covers, and a low-confidence estimate with the reason', () => {
    show(result([
      suggestion({ materialId: 'a', name: 'Alpha', flag: 'at_threshold' }),
      suggestion({ materialId: 'b', name: 'Beta', confidence: 'low', historyDays: 9 }),
      suggestion({ materialId: 'c', name: 'Gamma', confidence: 'low', historyDays: 40 }),
    ]));
    expect(screen.getByText('Already low')).toBeTruthy();
    const lows = screen.getAllByText('Low confidence');
    expect(lows).toHaveLength(2);
    expect(lows[0].getAttribute('title')).toMatch(/under two weeks/);
    expect(lows[1].getAttribute('title')).toMatch(/varies a lot/);
  });

  it('restocks the material it is about', () => {
    const onRestock = show(result([suggestion({ materialId: 'a', name: 'Alpha' }), suggestion({ materialId: 'b', name: 'Beta' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Restock Beta' }));
    expect(onRestock).toHaveBeenCalledWith('b');
  });

  it('shows at most eight, and says how many more', () => {
    show(result(Array.from({ length: 11 }, (_, i) => suggestion({ materialId: `m${i}`, name: `Material ${i}` }))));
    expect(screen.getAllByRole('button', { name: /^Restock/ })).toHaveLength(8);
    expect(screen.getByText('And 3 more.')).toBeTruthy();
  });

  it('says which materials do not have enough history yet, rather than guessing', () => {
    show(result([], ['butter', 'sugar', 'gone']));
    expect(screen.getByText('Not enough history yet to say for Butter, Sugar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Restock/ })).toBeNull();
  });
});
