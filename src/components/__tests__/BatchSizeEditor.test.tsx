import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchSizeEditor } from '../BatchSizeEditor';
import type { MenuItem, ProductionRun } from '../../types';

const base: MenuItem = { id: 'base', name: 'Sponge Base', sellingPrice: 0, recipe: [{ materialId: 'gel', amount: 220, unit: 'g' }] };
const run = (over: Record<string, unknown> = {}) => ({ recipeId: 'base', date: '2026-10-10', createdAt: 0, quantityProduced: 9, batches: 2, ...over }) as unknown as ProductionRun;
const renderEditor = (item: MenuItem, runs: ProductionRun[] = []) => {
  const onSet = vi.fn();
  const view = render(<BatchSizeEditor item={item} runs={runs} unitCost={72} currencySymbol="₹" onSet={onSet} />);
  return { onSet, view };
};

describe('BatchSizeEditor', () => {
  it('sets what one batch makes, and offers once to divide a recipe written for the whole batch', () => {
    const { onSet, view } = renderEditor(base);
    expect(screen.getByText(/Leave it empty if you make them one at a time/)).toBeTruthy();
    const box = screen.getByLabelText('One batch makes');
    fireEvent.change(box, { target: { value: '4,5' } });
    fireEvent.blur(box);
    expect(onSet).toHaveBeenLastCalledWith(4.5);
    view.rerender(<BatchSizeEditor item={{ ...base, batchMakes: 4.5 }} runs={[]} unitCost={72} currencySymbol="₹" onSet={onSet} />);
    expect(screen.getByText('₹324.00')).toBeTruthy(); // 4.5 × ₹72
    fireEvent.click(screen.getByRole('button', { name: 'Divide it by 4.5' }));
    expect(onSet).toHaveBeenLastCalledWith(4.5, 'from-whole-batch');
    expect(screen.queryByRole('button', { name: 'Divide it by 4.5' })).toBeNull();
  });

  it('clears the batch size when the box is emptied', () => {
    const { onSet } = renderEditor({ ...base, batchMakes: 4.5 });
    const box = screen.getByLabelText('One batch makes');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSet).toHaveBeenLastCalledWith(null);
  });

  it('shows what recent batches made against the size set, and uses it, keeping one batch\'s ingredients', () => {
    const { onSet } = renderEditor({ ...base, batchMakes: 4.5 }, [run({ quantityYield: 8 }), run({ date: '2026-10-11', quantityYield: 8 })]);
    expect(screen.getByText(/Your last 2 runs in batches made/)).toBeTruthy();
    expect(screen.getByText(/\(you set 4\.5\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use 4' }));
    expect(onSet).toHaveBeenLastCalledWith(4, 'keep-batch');
  });

  it('says so when batches came out as set, with nothing to use', () => {
    renderEditor({ ...base, batchMakes: 4.5 }, [run()]);
    expect(screen.getByText(/Your last run in batches made/)).toBeTruthy();
    expect(screen.getByText(/as set\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
  });
});

describe('BatchSizeEditor, for an item counted by weight', () => {
  const ganache: MenuItem = { id: 'g', name: 'Ganache', sellingPrice: 0, notForSale: true, countedIn: 'kg', recipe: [{ materialId: 'cream', amount: 500, unit: 'ml' }] };

  it('takes the batch in kg and says it in grams and kilos', () => {
    const onSet = vi.fn();
    const view = render(<BatchSizeEditor item={ganache} runs={[]} unitCost={400} currencySymbol="₹" onSet={onSet} />);
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText(/0.8 kg of ganache from one mix/)).toBeTruthy();
    view.rerender(<BatchSizeEditor item={{ ...ganache, batchMakes: 0.8 }} runs={[]} unitCost={400} currencySymbol="₹" onSet={onSet} />);
    expect(screen.getByText(/The recipe below is for 1 kg; a batch makes 800 g/)).toBeTruthy();
    expect(screen.getByText('₹320.00')).toBeTruthy(); // 0.8 kg × ₹400 a kg
  });

  it('reports what batches actually made in grams', () => {
    const runs = [{ recipeId: 'g', date: '2026-10-10', createdAt: 0, quantityProduced: 0.75, batches: 1 }] as unknown as ProductionRun[];
    render(<BatchSizeEditor item={{ ...ganache, batchMakes: 0.8 }} runs={runs} unitCost={400} currencySymbol="₹" onSet={vi.fn()} />);
    expect(screen.getByText('750 g')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use 750 g' })).toBeTruthy();
  });
});
