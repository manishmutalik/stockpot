import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepricingCard } from '../RepricingCard';
import { pricingStamp } from '../../utils/pricing';

const mats = (butter: number): any[] => [{ id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: butter, category: 'Raw Materials' }];
const item = (id: string, name: string): any => {
  const i = { id, name, sellingPrice: 400, recipe: [{ materialId: 'butter', amount: 200, unit: 'g' }] };
  return { ...i, ...pricingStamp(i, mats(500), '2026-06-01') };
};

describe('RepricingCard', () => {
  it('shows nothing while margins hold', () => {
    const { container } = render(<RepricingCard menu={[item('a', 'Cake')]} materials={mats(500)} settings={{} as any} onOpen={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
  it('flags slipped items as soon as they slip, with the next review date and no price', () => {
    const onOpen = vi.fn();
    render(<RepricingCard menu={[item('a', 'Cake'), item('b', 'Brownie')]} materials={mats(900)} settings={{} as any} onOpen={onOpen} />);
    expect(screen.getByText("2 items' margins have slipped")).toBeTruthy();
    expect(screen.getByText(/75% → 55%/)).toBeTruthy();
    expect(screen.getByText(/and 1 more · Next price review \d+ [A-Z][a-z]{2}/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
    fireEvent.click(screen.getByText('View in Menu'));
    expect(onOpen).toHaveBeenCalled();
  });
  it('says it for one item', () => {
    render(<RepricingCard menu={[item('a', 'Cake')]} materials={mats(900)} settings={{} as any} onOpen={vi.fn()} />);
    expect(screen.getByText("1 item's margin has slipped")).toBeTruthy();
  });
  it('becomes a strong prompt to raise prices when a review is due', () => {
    const onStartReview = vi.fn();
    render(<RepricingCard menu={[item('a', 'Cake'), item('b', 'Brownie')]} materials={mats(900)} settings={{ lastPriceReviewOn: '2020-01-01' } as any} onOpen={vi.fn()} onStartReview={onStartReview} />);
    expect(screen.getByText('Time to raise prices')).toBeTruthy();
    expect(screen.getByText(/Your quarterly price review is due: 2 items are earning less than they should/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    expect(onStartReview).toHaveBeenCalled();
  });
  it('offers one tap to finish a due review when every margin is holding', () => {
    const onCompleteReview = vi.fn();
    render(<RepricingCard menu={[item('a', 'Cake')]} materials={mats(500)} settings={{ lastPriceReviewOn: '2020-01-01' } as any} onOpen={vi.fn()} onCompleteReview={onCompleteReview} />);
    expect(screen.getByText("Price review due: every item's margin is holding")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onCompleteReview).toHaveBeenCalled();
  });
});
