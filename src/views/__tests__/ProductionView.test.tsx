import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProductionView } from '../ProductionView';

const ymd = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]; };

const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 100, finishedGoodsStock: 3, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] },
  { id: 'bread', name: 'Bread', sellingPrice: 50, finishedGoodsStock: 0, recipe: [] },
];
const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 10 }];

const run = (id: string, over: Record<string, any> = {}): any => ({
  id, recipeId: 'cake', quantityProduced: 10, remainingQuantity: 3, date: ymd(0), costTotal: 50, createdAt: Date.now(), ...over,
});

function makeProps(over: Record<string, any> = {}) {
  return {
    menu, materials,
    productionRuns: [
      run('a', { quantityYield: 8, createdAt: 3 }),
      run('b', { recipeId: 'bread', remainingQuantity: 0, date: ymd(-10), costTotal: 30, createdAt: 2 }),
      run('c', { recipeId: 'bread', remainingQuantity: 0, date: ymd(-20), costTotal: 20, createdAt: 1 }),
    ],
    productionFilterRecipe: '',
    setProductionFilterRecipe: vi.fn(),
    setIsProductionRunModalOpen: vi.fn(),
    currency: { code: 'USD', symbol: '$' },
    settings: { name: 'Test Bakery' },
    openAddOrderModalFor: vi.fn(),
    setDiscardTarget: vi.fn(),
    deleteProductionRun: vi.fn(),
    deleteProductionRunSession: vi.fn(),
    convertAmount: (amount: number, from: string, to: string) => (from === 'g' && to === 'kg' ? amount / 1000 : amount),
    ...over,
  } as any;
}

describe('ProductionView', () => {
  it('summarises runs, units, cost and finished goods', () => {
    render(<ProductionView {...makeProps()} />);
    expect(screen.getByText('Total Runs').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('Units Baked').nextElementSibling?.textContent).toBe('30');
    expect(screen.getByText('28 sellable')).toBeTruthy();
    expect(screen.getByText('93.3% yield')).toBeTruthy();
    expect(screen.getByText('$100.00')).toBeTruthy(); // total cost
    expect(screen.getByText('Finished Goods').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('3 units on shelf')).toBeTruthy();
  });

  it('shows yield per run, flagging waste', () => {
    render(<ProductionView {...makeProps()} />);
    expect(screen.getByText('80% · -2 waste')).toBeTruthy();
    expect(screen.getAllByText('100% yield')).toHaveLength(2);
  });

  it('hides the retired Purpose column unless a run still has one', () => {
    const { rerender } = render(<ProductionView {...makeProps()} />);
    expect(screen.queryByText('Purpose')).toBeNull();
    rerender(<ProductionView {...makeProps({ productionRuns: [run('a', { purpose: 'sampling' })] })} />);
    expect(screen.getByText('Purpose')).toBeTruthy();
    expect(screen.getByText('🎁 Sampling')).toBeTruthy();
  });

  it('keeps the four Market Stock actions wired up', () => {
    const props = makeProps();
    render(<ProductionView {...props} />);
    fireEvent.click(screen.getByLabelText('Add Cake to an order'));
    expect(props.openAddOrderModalFor).toHaveBeenCalledWith('cake');
    fireEvent.click(screen.getByLabelText('Mark Cake as personal use'));
    expect(props.setDiscardTarget).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'cake', presetReason: 'Personal Use', maxQty: 3, costPerUnit: 5 }));
    fireEvent.click(screen.getByLabelText('Mark Cake as sampling'));
    expect(props.setDiscardTarget).toHaveBeenLastCalledWith(expect.objectContaining({ presetReason: 'Sampling' }));
    fireEvent.click(screen.getByLabelText('Discard Cake'));
    expect(props.setDiscardTarget).toHaveBeenLastCalledWith({ id: 'cake', name: 'Cake', type: 'recipe', maxQty: 3, unit: 'pcs', costPerUnit: 5 });
  });

  it('flags an aging batch on the stock card and the summary card', () => {
    const props = makeProps({ productionRuns: [run('a', { date: ymd(-4) })] });
    render(<ProductionView {...props} />);
    expect(screen.getByText('Check freshness')).toBeTruthy();
    expect(screen.getByText('1 freshness alert')).toBeTruthy();
    expect(screen.getByText('Oldest batch 4d old')).toBeTruthy();
  });

  it('filters by recipe (via the shared setter) and by date range', () => {
    const props = makeProps();
    const { rerender } = render(<ProductionView {...props} />);
    fireEvent.change(screen.getByLabelText('Filter by recipe'), { target: { value: 'bread' } });
    expect(props.setProductionFilterRecipe).toHaveBeenCalledWith('bread');
    rerender(<ProductionView {...makeProps({ productionFilterRecipe: 'bread' })} />);
    expect(screen.getByText('2 of 3 runs')).toBeTruthy();

    rerender(<ProductionView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: ymd(-12) } });
    expect(screen.getByText('2 of 3 runs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 of 3 runs')).toBeTruthy();
  });

  it('paginates long histories', () => {
    const many = Array.from({ length: 15 }, (_, i) => run(`r${i}`, { createdAt: 100 - i, costTotal: i + 1 }));
    render(<ProductionView {...makeProps({ productionRuns: many })} />);
    expect(screen.getByText('Page', { exact: false }).textContent).toContain('1');
    expect(screen.getAllByTitle('Delete Production Run')).toHaveLength(12);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getAllByTitle('Delete Production Run')).toHaveLength(3);
  });

  it('keeps a session whole with its delete-session action', () => {
    const props = makeProps({
      productionRuns: [run('a', { productionSessionId: 's' }), run('b', { productionSessionId: 's', recipeId: 'bread' })],
    });
    render(<ProductionView {...props} />);
    expect(screen.getByText(/Session \(2 items\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Delete Session/ }));
    expect(props.deleteProductionRunSession).toHaveBeenCalledWith('s');
  });

  it('deletes a single run and opens the logging modal', () => {
    const props = makeProps({ productionRuns: [run('a')] });
    render(<ProductionView {...props} />);
    fireEvent.click(within(screen.getByRole('table')).getByTitle('Delete Production Run'));
    expect(props.deleteProductionRun).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: /Log Production Run/ }));
    expect(props.setIsProductionRunModalOpen).toHaveBeenCalledWith(true);
  });

  it('shows the empty state before any run is logged', () => {
    render(<ProductionView {...makeProps({ productionRuns: [], menu: [] })} />);
    expect(screen.getByText('No production runs yet')).toBeTruthy();
  });
});
