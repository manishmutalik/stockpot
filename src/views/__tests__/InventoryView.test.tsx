import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { InventoryView } from '../InventoryView';
import { addDays, todayInZone } from '../../utils/localDate';

const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };

const mk = (id: string, name: string, over: Record<string, any> = {}) => ({
  id, name, unit: 'kg', initialStock: 10, remaining: 10, used: 0, costPerUnit: 10,
  category: 'Raw Materials', threshold: 2, dateAdded: '2026-01-01', ...over,
});

const flour = mk('flour', 'Bread Flour');
const almonds = mk('almonds', 'Almonds', { initialStock: 0.003, remaining: 0.003, threshold: 0.05, costPerUnit: 840 });
const yeast = mk('yeast', 'Yeast', { unit: 'g', initialStock: 2.4, remaining: 2.4, threshold: 2, category: 'Pantry' });
const milk = mk('milk', 'Milk', { unit: 'l', expiryDate: daysFromNow(-1) });

function makeProps(overrides: Record<string, any> = {}) {
  const items = overrides.items ?? [flour, almonds, yeast, milk];
  return {
    remainingInventory: items,
    sortedRemainingInventory: items,
    lowStockItems: items.filter((i: any) => i.threshold > 0 && i.remaining <= i.threshold),
    categories: ['Raw Materials', 'Pantry'],
    settings: { name: 'Test Bakery', gstApplicable: false },
    currency: { code: 'USD', symbol: '$' },
    inventorySortBy: 'name',
    inventorySortOrder: 'asc',
    isRefreshing: false,
    lastSynced: new Date(),
    patchMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    setRestockMaterial: vi.fn(),
    setRestockExpiryDate: vi.fn(),
    setDiscardTarget: vi.fn(),
    openNutritionEditor: vi.fn(),
    setAddMaterialCategory: vi.fn(),
    setShowAddMaterialModal: vi.fn(),
    setInventorySortBy: vi.fn(),
    setInventorySortOrder: vi.fn(),
    handleDownloadTemplate: vi.fn(),
    handleImportCSV: vi.fn(),
    refreshData: vi.fn(),
    ...overrides,
  } as any;
}

describe('InventoryView reorder suggestions', () => {
  const today = todayInZone(undefined);
  // 6 loaves a day x 0.5 kg = 3 kg of flour a day; 10 kg lasts a little over 3 days.
  const menu = [{ id: 'loaf', name: 'Loaf', recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];
  const runs = Array.from({ length: 28 }, (_, i) => ({ id: `r${i}`, recipeId: 'loaf', quantityProduced: 6, date: addDays(today, -i) }));
  const props = (over: Record<string, any> = {}) => makeProps({ items: [mk('flour', 'Bread Flour', { dateAdded: addDays(today, -60), threshold: 0 })], menu, productionRuns: runs, wastageLogs: [], ...over });

  it('shows what will run out, and restocks it from the card', () => {
    const p = props();
    render(<InventoryView {...p} />);
    const card = screen.getByRole('region', { name: 'Reorder suggestions' });
    expect(within(card).getByText('Bread Flour')).toBeTruthy();
    expect(card.textContent).toContain('About 3 days left');
    expect(card.textContent).toContain('Order about 23 kg');
    fireEvent.click(within(card).getByRole('button', { name: 'Restock Bread Flour' }));
    expect(p.setRestockMaterial).toHaveBeenCalledWith(expect.objectContaining({ id: 'flour' }));
  });

  it('shows nothing when there is no production history to go on', () => {
    render(<InventoryView {...props({ productionRuns: [] })} />);
    expect(screen.queryByRole('region', { name: 'Reorder suggestions' })).toBeNull();
  });

  it('shows nothing when stock is comfortable', () => {
    render(<InventoryView {...props({ items: [mk('flour', 'Bread Flour', { dateAdded: addDays(today, -60), threshold: 0, remaining: 100 })] })} />);
    expect(screen.queryByRole('region', { name: 'Reorder suggestions' })).toBeNull();
  });
});

describe('InventoryView', () => {
  it('spotlights the material furthest below its threshold and restocks it', () => {
    const props = makeProps();
    render(<InventoryView {...props} />);
    expect(screen.getByText('CRITICAL STOCK ALERT')).toBeTruthy();
    expect(screen.getByText('-94% Par')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restock Bread Flour' }));
    expect(props.setRestockMaterial).toHaveBeenLastCalledWith(flour);
    expect(props.setRestockMaterial).toHaveBeenCalledWith(almonds);
    expect(props.setRestockExpiryDate).toHaveBeenCalledWith('');
  });

  it('shows a healthy state and value total when nothing is low', () => {
    render(<InventoryView {...makeProps({ items: [flour, milk] })} />);
    expect(screen.getByText('All stocked up')).toBeTruthy();
    // (10 + 10) kg/l at $10
    expect(screen.getByText('$200.00')).toBeTruthy();
  });

  it('labels rows Low Stock / Reorder Soon / In Stock from the threshold', () => {
    render(<InventoryView {...makeProps()} />);
    const row = (name: string) => screen.getByLabelText(`Name of ${name}`).closest('tr')!;
    expect(within(row('Almonds')).getByText('Low Stock')).toBeTruthy();
    expect(within(row('Yeast')).getByText('Reorder Soon')).toBeTruthy();
    expect(within(row('Bread Flour')).getByText('In Stock')).toBeTruthy();
    expect(within(row('Milk')).getByText('Expired')).toBeTruthy();
  });

  it('searches by name and filters by category, status and unit', () => {
    render(<InventoryView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search materials'), { target: { value: 'flo' } });
    expect(screen.queryByLabelText('Name of Almonds')).toBeNull();
    expect(screen.getByLabelText('Name of Bread Flour')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search materials'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'Pantry' } });
    expect(screen.getByLabelText('Name of Yeast')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Bread Flour')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'all' } });

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'low' } });
    expect(screen.getByLabelText('Name of Almonds')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Yeast')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'expiry' } });
    expect(screen.getByLabelText('Name of Milk')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Almonds')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'all' } });

    fireEvent.change(screen.getByLabelText('Filter by unit'), { target: { value: 'g' } });
    expect(screen.getByLabelText('Name of Yeast')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Milk')).toBeNull();
  });

  it('says so when filters match nothing', () => {
    render(<InventoryView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search materials'), { target: { value: 'zzz' } });
    expect(screen.getByText('No materials match these filters.')).toBeTruthy();
  });

  it('paginates long lists', () => {
    const many = Array.from({ length: 20 }, (_, i) => mk(`m${i}`, `Item ${String(i).padStart(2, '0')}`));
    render(<InventoryView {...makeProps({ items: many })} />);
    expect(screen.getByLabelText('Name of Item 00')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Item 15')).toBeNull();
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByLabelText('Name of Item 15')).toBeTruthy();
    expect(screen.queryByLabelText('Name of Item 00')).toBeNull();
  });

  it('keeps inline editing wired to the same handlers', () => {
    const props = makeProps();
    render(<InventoryView {...props} />);
    fireEvent.change(screen.getByLabelText('Current stock of Bread Flour'), { target: { value: '12' } });
    expect(props.updateMaterial).toHaveBeenCalledWith('flour', 'initialStock', 12);
    fireEvent.change(screen.getByLabelText('Threshold of Bread Flour'), { target: { value: '3' } });
    expect(props.updateMaterial).toHaveBeenCalledWith('flour', 'threshold', 3);
    fireEvent.change(screen.getByLabelText('Category of Bread Flour'), { target: { value: 'Pantry' } });
    expect(props.updateMaterial).toHaveBeenCalledWith('flour', 'category', 'Pantry');
    fireEvent.click(screen.getByLabelText('Delete Bread Flour'));
    expect(props.deleteMaterial).toHaveBeenCalledWith('flour');
  });

  it('converts stock, cost and threshold together when the unit changes', () => {
    const props = makeProps();
    render(<InventoryView {...props} />);
    fireEvent.change(screen.getByLabelText('Unit of Bread Flour'), { target: { value: 'g' } });
    expect(props.patchMaterial).toHaveBeenCalledWith('flour', {
      unit: 'g', initialStock: 10000, costPerUnit: 0.01, threshold: 2000,
    });
  });

  it('adds and imports into the category being browsed', () => {
    const props = makeProps();
    render(<InventoryView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    expect(props.setAddMaterialCategory).toHaveBeenLastCalledWith('Raw Materials');
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'Pantry' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    expect(props.setAddMaterialCategory).toHaveBeenLastCalledWith('Pantry');
    expect(props.setShowAddMaterialModal).toHaveBeenCalledWith(true);
  });

  it('shows the GST column only when GST is enabled', () => {
    const { rerender } = render(<InventoryView {...makeProps()} />);
    expect(screen.queryByLabelText('GST rate of Bread Flour')).toBeNull();
    rerender(<InventoryView {...makeProps({ settings: { name: 'B', gstApplicable: true } })} />);
    expect(screen.getByLabelText('GST rate of Bread Flour')).toBeTruthy();
  });

  it('keeps materials in unlisted categories visible and reassignable', () => {
    const stray = mk('stray', 'Mystery', { category: 'Old Category' });
    render(<InventoryView {...makeProps({ items: [flour, stray] })} />);
    expect(screen.getByLabelText('Name of Mystery')).toBeTruthy();
    const picker = screen.getByLabelText('Category of Mystery') as HTMLSelectElement;
    expect(picker.value).toBe('Old Category');
  });

  describe('price history', () => {
    const log = [
      { id: 'a', materialId: 'flour', date: '2026-02-01', unitCost: 9, unit: 'kg', quantity: 20, source: 'initial', createdAt: 1 },
      { id: 'b', materialId: 'flour', date: '2026-03-01', unitCost: 11, unit: 'kg', quantity: 10, macAfter: 10, source: 'restock', createdAt: 2 },
      { id: 'c', materialId: 'almonds', date: '2026-03-01', unitCost: 777, unit: 'kg', source: 'restock', createdAt: 3 },
    ];

    it("opens a material's recorded prices from its row, and only that material's", () => {
      render(<InventoryView {...makeProps({ priceLog: log })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Price history of Bread Flour' }));
      const dialog = screen.getByRole('dialog', { name: /Price history: Bread Flour/ });
      expect(within(dialog).getAllByRole('row')).toHaveLength(3); // header and two prices
      expect(within(dialog).getByText('Restock')).toBeTruthy();
      expect(within(dialog).getByText('Opening cost')).toBeTruthy();
      expect(within(dialog).queryByText(/777/)).toBeNull();
    });

    it('closes again', () => {
      render(<InventoryView {...makeProps({ priceLog: log })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Price history of Bread Flour' }));
      fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[1]);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('explains a material that has no history yet, and copes with no log at all', () => {
      render(<InventoryView {...makeProps()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Price history of Yeast' }));
      expect(screen.getByText(/No prices recorded yet/)).toBeTruthy();
    });
  });
});
