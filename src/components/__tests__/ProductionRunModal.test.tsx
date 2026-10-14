import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductionRunModal } from '../ProductionRunModal';
import type { MenuItem } from '../../types';

const menu = [
  { id: 'cake', name: 'Cake', recipe: [], sellingPrice: 20 },
  { id: 'cookie', name: 'Cookie', recipe: [], sellingPrice: 5 },
];
const materials: any[] = [];
const currency = { symbol: '$' };

function renderModal(onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: null })) {
  const onClose = vi.fn();
  render(
    <ProductionRunModal
      isOpen={true}
      onClose={onClose}
      menu={menu as any}
      materials={materials}
      onSave={onSave}
      currency={currency}
    />
  );
  return { onSave, onClose };
}

describe('ProductionRunModal — multi-item logging', () => {
  it('starts with a single item row, labeled singular, with an "Add another item" affordance', () => {
    renderModal();
    expect(screen.getByText('Recipe')).toBeTruthy();
    expect(screen.getByText('Add another item')).toBeTruthy();
  });

  it('adding a row switches the label to a count and pre-fills the new row from the menu (never starts blank)', () => {
    renderModal();
    fireEvent.click(screen.getByText('Add another item'));
    expect(screen.getByText('Items (2)')).toBeTruthy();
    // Both rows default to the first menu item, same as the original single-item form always did.
    expect(screen.getAllByDisplayValue('Cake')).toHaveLength(2);
  });

  it('removing a row is only offered once there is more than one item, and going back to one restores the singular label', () => {
    renderModal();
    expect(screen.queryByTitle('Remove item')).toBeNull();
    fireEvent.click(screen.getByText('Add another item'));
    expect(screen.getAllByTitle('Remove item')).toHaveLength(2);
    fireEvent.click(screen.getAllByTitle('Remove item')[0]);
    expect(screen.queryByTitle('Remove item')).toBeNull();
    expect(screen.getByText('Recipe')).toBeTruthy();
  });

  it('blocks submission and highlights the specific row when its quantity is invalid', async () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByText('Add another item'));

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    fireEvent.change(qtyInputs[1], { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: /Log 2 Items/i }));

    expect(await screen.findByText('Quantity must be more than 0 for item 2.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits one payload row per item, with shared date/notes and per-row quantity, and no purpose field', async () => {
    const onSave = vi.fn().mockResolvedValue({ succeededCount: 2, failedIndex: null, sessionId: 'sess1' });
    renderModal(onSave);

    fireEvent.click(screen.getByText('Add another item'));
    const selects = screen.getAllByDisplayValue('Cake').filter(el => el.tagName === 'SELECT') as HTMLSelectElement[];
    fireEvent.change(selects[1], { target: { value: 'cookie' } });

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    fireEvent.change(qtyInputs[0], { target: { value: '3' } });
    fireEvent.change(qtyInputs[1], { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: /Log 2 Items/i }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [rows, existingSessionId] = onSave.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ recipeId: 'cake', quantityProduced: 3, quantityYield: 3 });
    expect(rows[1]).toMatchObject({ recipeId: 'cookie', quantityProduced: 7, quantityYield: 7 });
    expect(rows[0].date).toBe(rows[1].date); // shared session-level date
    expect(rows[0]).not.toHaveProperty('purpose');
    expect(rows[1]).not.toHaveProperty('purpose');
    expect(existingSessionId).toBeUndefined(); // first attempt, no prior session to resume
  });

  it('on partial failure, drops the succeeded row and keeps only the failed one for retry, preserving the session id', async () => {
    const onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: 1, sessionId: 'sess-abc' });
    const { onClose } = renderModal(onSave);

    fireEvent.click(screen.getByText('Add another item'));
    const selects = screen.getAllByDisplayValue('Cake').filter(el => el.tagName === 'SELECT') as HTMLSelectElement[];
    fireEvent.change(selects[1], { target: { value: 'cookie' } });

    fireEvent.click(screen.getByRole('button', { name: /Log 2 Items/i }));

    await screen.findByText(/Logged 1 of 2 item\(s\)/);
    // Modal stays open on partial failure — the user needs to see and retry the remainder.
    expect(onClose).not.toHaveBeenCalled();
    // Only one item row left in the form now (the one that failed).
    expect(screen.getByText('Recipe')).toBeTruthy(); // back to singular — one row remains

    // Retry: submit the remaining row again — must reuse the same session id.
    onSave.mockResolvedValue({ succeededCount: 1, failedIndex: null, sessionId: 'sess-abc' });
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const [, existingSessionIdOnRetry] = onSave.mock.calls[1];
    expect(existingSessionIdOnRetry).toBe('sess-abc');
  });

  it('closes and resets the form when every row saves successfully', async () => {
    const onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: null, sessionId: undefined });
    const { onClose } = renderModal(onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('ProductionRunModal — redesigned form', () => {
  const renderWithCosts = (onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: null })) => {
    const onClose = vi.fn();
    render(
      <ProductionRunModal
        isOpen
        onClose={onClose}
        menu={[{ id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }] as any}
        materials={[{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 10 }] as any}
        onSave={onSave}
        currency={currency}
      />
    );
    return { onSave, onClose };
  };

  it('is a labelled dialog that closes from the header button', () => {
    const { onClose } = renderModal();
    expect(screen.getByRole('dialog', { name: 'Log Production Run' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps the quantity with the − and + buttons and never below zero', () => {
    renderModal();
    const qty = screen.getByPlaceholderText('Qty') as HTMLInputElement;
    fireEvent.click(screen.getByLabelText('Increase quantity'));
    expect(qty.value).toBe('2');
    fireEvent.click(screen.getByLabelText('Decrease quantity'));
    fireEvent.click(screen.getByLabelText('Decrease quantity'));
    expect(qty.value).toBe(''); // 0 renders empty and fails validation on save
  });

  it('shows the total and per-unit cost as the quantity changes', () => {
    renderWithCosts();
    expect(screen.getByText('$5.00')).toBeTruthy(); // 0.5 kg x $10 x 1
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '4' } });
    expect(screen.getByText('$20.00')).toBeTruthy();
    expect(screen.getByText('($5.00 / unit)')).toBeTruthy();
  });

  it('records what actually came out for a row, and what the short pieces cost', async () => {
    const { onSave } = renderWithCosts();
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Came out different?' }));
    fireEvent.change(screen.getByLabelText('Actually made'), { target: { value: '8' } });
    // $50 for 10 planned: 2 short is $10.
    expect(screen.getByText('2 short · $10.00 lost in production')).toBeTruthy();
    expect(screen.getByText('($6.25 / unit)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ quantityProduced: 10, quantityYield: 8 });
    expect(onSave.mock.calls[0][0][0].batches).toBeUndefined();
  });

  it('takes what came out for each item, and decimals', async () => {
    const { onSave } = renderWithCosts();
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByText('Add another item'));
    fireEvent.click(screen.getAllByRole('button', { name: '+ Came out different?' })[1]);
    fireEvent.change(screen.getByLabelText('Actually made'), { target: { value: '3' } });
    expect(screen.getByText('2 more than planned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Log 2 Items/ }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].map((r: { quantityProduced: number; quantityYield: number }) => [r.quantityProduced, r.quantityYield])).toEqual([[2.5, 2.5], [1, 3]]);
  });

  it('refuses what came out beyond three times what was planned', async () => {
    const { onSave } = renderWithCosts();
    fireEvent.click(screen.getByRole('button', { name: '+ Came out different?' }));
    fireEvent.change(screen.getByLabelText('Actually made'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    expect(await screen.findByText('What was actually made can be at most 3 times what was planned.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ProductionRunModal — batches', () => {
  const batchMenu = [
    { id: 'base', name: 'Sponge Base', recipe: [{ materialId: 'gel', amount: 0.1, unit: 'kg' }], sellingPrice: 0, batchMakes: 4.5 },
    { id: 'cookie', name: 'Cookie', recipe: [], sellingPrice: 5 },
  ];
  const gel = [{ id: 'gel', name: 'Cake gel', unit: 'kg', costPerUnit: 100 }];
  const renderBatches = () => {
    const onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: null });
    render(<ProductionRunModal isOpen onClose={vi.fn()} menu={batchMenu as unknown as MenuItem[]} materials={gel} onSave={onSave} currency={currency} />);
    return { onSave };
  };

  it('counts an item made in batches in batches, says what that makes, and saves the pieces, the batches and what came out', async () => {
    const { onSave } = renderBatches();
    expect(screen.getByRole('button', { name: 'Batches', pressed: true })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2' } });
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText(/one batch makes 4\.5/)).toBeTruthy();
    // The box for what came out is open already; empty is as planned.
    fireEvent.change(screen.getByLabelText('Actually made'), { target: { value: '8' } });
    // $90 of gel for 9 bases: one short is $10.
    expect(screen.getByText('1 short · $10.00 lost in production')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ recipeId: 'base', quantityProduced: 9, quantityYield: 8, batches: 2, costTotal: 90 });
  });

  it('switches to pieces keeping what the ingredients are for, and back', async () => {
    const { onSave } = renderBatches();
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pieces' }));
    expect((screen.getByPlaceholderText('Qty') as HTMLInputElement).value).toBe('9');
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ quantityProduced: 9, quantityYield: 9 });
    expect(onSave.mock.calls[0][0][0].batches).toBeUndefined();
  });

  it('offers no batches for an item without a batch size', () => {
    renderBatches();
    fireEvent.change(screen.getByDisplayValue('Sponge Base'), { target: { value: 'cookie' } });
    expect(screen.queryByRole('button', { name: 'Batches' })).toBeNull();
  });
});

describe('ProductionRunModal — items made from other items', () => {
  it('says which bases a row takes from stock, and warns when there are not enough', () => {
    const partsMenu = [
      { id: 'cream', name: 'Cream Cake', recipe: [], sellingPrice: 900, parts: [{ itemId: 'base', quantity: 1 }] },
      { id: 'base', name: 'Sponge Base', recipe: [], sellingPrice: 0, notForSale: true, finishedGoodsStock: 2 },
    ];
    render(<ProductionRunModal isOpen onClose={vi.fn()} menu={partsMenu as unknown as MenuItem[]} materials={[]} onSave={vi.fn()} currency={currency} />);
    expect(screen.getByText(/Takes 1 Sponge Base from stock \(2 there\)/)).toBeTruthy();
    fireEvent.change(screen.getAllByPlaceholderText('Qty')[0], { target: { value: '3' } });
    expect(screen.getByText(/Takes 3 Sponge Base from stock \(2 there\): not enough/)).toBeTruthy();
  });
});

describe('ProductionRunModal — items made when ordered', () => {
  it('does not offer them: they are not made ahead', () => {
    const items = [
      { id: 'pcake', name: 'Pineapple cake', recipe: [], sellingPrice: 900, madeToOrder: true },
      { id: 'cookie', name: 'Cookie', recipe: [], sellingPrice: 5 },
    ];
    render(<ProductionRunModal isOpen onClose={vi.fn()} menu={items as unknown as MenuItem[]} materials={[]} onSave={vi.fn()} currency={currency} />);
    expect(screen.queryByRole('option', { name: 'Pineapple cake' })).toBeNull();
    expect(screen.getByDisplayValue('Cookie')).toBeTruthy();
  });
});
