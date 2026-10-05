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
  it('counts items that need repricing, names the worst, and opens the Menu', () => {
    const onOpen = vi.fn();
    render(<RepricingCard menu={[item('a', 'Cake'), item('b', 'Brownie')]} materials={mats(900)} settings={{} as any} onOpen={onOpen} />);
    expect(screen.getByText('2 items need repricing')).toBeTruthy();
    expect(screen.getByText(/margin 75% → 55%/)).toBeTruthy();
    expect(screen.getByText(/and 1 more/)).toBeTruthy();
    fireEvent.click(screen.getByText('View in Menu'));
    expect(onOpen).toHaveBeenCalled();
  });
  it('says "1 item needs repricing" for one', () => {
    render(<RepricingCard menu={[item('a', 'Cake')]} materials={mats(900)} settings={{} as any} onOpen={vi.fn()} />);
    expect(screen.getByText('1 item needs repricing')).toBeTruthy();
  });
});
