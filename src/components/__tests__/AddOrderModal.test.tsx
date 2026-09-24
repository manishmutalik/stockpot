import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddOrderModal } from '../AddOrderModal';

const menu = [
  { id: 'cake', name: 'Cake', sellingPrice: 20 },
  { id: 'cookie', name: 'Cookie', sellingPrice: 5 },
];
const currency = { symbol: '$' };

function renderModal(onSave = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <AddOrderModal isOpen={true} onClose={onClose} menu={menu as any} onSave={onSave} currency={currency} />
  );
  return { onSave, onClose };
}

describe('AddOrderModal', () => {
  it('starts with a single item row, labeled singular', () => {
    renderModal();
    expect(screen.getByText('Item')).toBeTruthy();
    expect(screen.getByText('Add another item')).toBeTruthy();
  });

  it('adding a row switches to a count label and shows the delivery-elsewhere note', () => {
    renderModal();
    fireEvent.click(screen.getByText('Add another item'));
    expect(screen.getByText('Items (2)')).toBeTruthy();
    expect(screen.getByText(/Delivery details can be added per item afterward/)).toBeTruthy();
  });

  it('computes a live total order value from item price × quantity across rows', () => {
    renderModal();
    fireEvent.click(screen.getByText('Add another item'));
    const selects = screen.getAllByDisplayValue('Cake').filter(el => el.tagName === 'SELECT') as HTMLSelectElement[];
    fireEvent.change(selects[1], { target: { value: 'cookie' } });

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    fireEvent.change(qtyInputs[0], { target: { value: '2' } }); // 2 * 20 = 40
    fireEvent.change(qtyInputs[1], { target: { value: '3' } }); // 3 * 5 = 15

    expect(screen.getByText('$55.00')).toBeTruthy();
  });

  it('blocks submission when a row has an invalid quantity', async () => {
    const { onSave } = renderModal();
    const qtyInput = screen.getByPlaceholderText('Qty');
    fireEvent.change(qtyInput, { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));

    expect(await screen.findByText('Quantity must be at least 1.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits shared date/customer fields plus every line item, then resets and closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderModal(onSave);

    fireEvent.click(screen.getByText('Add another item'));
    const selects = screen.getAllByDisplayValue('Cake').filter(el => el.tagName === 'SELECT') as HTMLSelectElement[];
    fireEvent.change(selects[1], { target: { value: 'cookie' } });

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByPlaceholderText('Phone'), { target: { value: '555-1234' } });

    fireEvent.click(screen.getByRole('button', { name: /Add Order \(2 Items\)/i }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [common, lineItems] = onSave.mock.calls[0];
    expect(common).toMatchObject({ customerName: 'Asha', customerPhone: '555-1234' });
    expect(lineItems).toEqual([
      { menuItemId: 'cake', quantity: 1 },
      { menuItemId: 'cookie', quantity: 1 },
    ]);

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('omits customerName/customerPhone from the payload when left blank', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal(onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [common] = onSave.mock.calls[0];
    expect(common.customerName).toBeUndefined();
    expect(common.customerPhone).toBeUndefined();
  });

  it('keeps the form open and shows an error when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network error'));
    const { onClose } = renderModal(onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));

    expect(await screen.findByText('Failed to add order. Please try again.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
