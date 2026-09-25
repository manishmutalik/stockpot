import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductionRunModal } from '../ProductionRunModal';

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

    expect(await screen.findByText('Quantity must be at least 1 for item 2.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits one payload row per item, with shared date/purpose/notes and per-row quantity', async () => {
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
    expect(rows[0].purpose).toBe(rows[1].purpose); // shared session-level purpose
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
