import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddOrderModal } from '../AddOrderModal';
import type { OrderParser, OrderParseOutcome } from '../../hooks/useOrderParser';

const menu = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, finishedGoodsStock: 10 },
  { id: 'cookie', name: 'Butter Cookie', sellingPrice: 20, finishedGoodsStock: 10 },
];
const currency = { symbol: '₹' };
const form = (over: Record<string, any> = {}): OrderParseOutcome => ({
  ok: true, remaining: 29,
  form: { lineItems: [], notFound: [], knownCustomer: false, ...over },
});

function renderModal(outcome: OrderParseOutcome | null, onSave = vi.fn().mockResolvedValue(undefined)) {
  const parse = vi.fn().mockResolvedValue(outcome);
  const parser: OrderParser | null = outcome ? { parse } : null;
  render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={onSave} currency={currency} orderParser={parser} />);
  return { onSave, parse };
}
const paste = (text: string) => fireEvent.change(screen.getByLabelText(/Fill from a message/), { target: { value: text } });
const fill = async () => { fireEvent.click(screen.getByRole('button', { name: 'Fill the form' })); await waitFor(() => expect(screen.queryByText('Reading…')).toBeNull()); };
const value = (label: RegExp | string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const itemSelects = () => screen.getAllByRole('combobox', { name: /^Item/ }) as HTMLSelectElement[];

describe('the delivery address', () => {
  it('can be typed and is saved with the order', async () => {
    const { onSave } = renderModal(null);
    fireEvent.change(screen.getByLabelText(/Delivery address/), { target: { value: '12 MG Road, Bengaluru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ deliveryAddress: '12 MG Road, Bengaluru' });
  });

  it('is left out when empty', async () => {
    const { onSave } = renderModal(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].deliveryAddress).toBeUndefined();
  });
});

describe('filling the form from a message', () => {
  it('is not offered when AI is not available', () => {
    renderModal(null);
    expect(screen.queryByLabelText(/Fill from a message/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fill the form' })).toBeNull();
  });

  it('is offered when it is, and needs a message first', () => {
    renderModal(form());
    expect((screen.getByRole('button', { name: 'Fill the form' }) as HTMLButtonElement).disabled).toBe(true);
    paste('2 cakes please');
    expect((screen.getByRole('button', { name: 'Fill the form' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the message as pasted and pre-fills items, customer, date, payment, discount and address', async () => {
    const { parse } = renderModal(form({
      lineItems: [{ menuItemId: 'cookie', quantity: 3 }, { menuItemId: 'cake', quantity: 2 }],
      customerName: 'Anita', customerPhone: '+91 98450 10101', date: '2026-10-10', payLater: false, method: 'upi', discountAmount: 25, deliveryAddress: '12 MG Road',
    }));
    paste('Hi Anita here, 3 cookies and 2 cakes for Saturday');
    await fill();
    expect(parse).toHaveBeenCalledWith('Hi Anita here, 3 cookies and 2 cakes for Saturday');

    const selects = itemSelects();
    expect(selects[0].value).toBe('cookie');
    expect(selects[1].value).toBe('cake');
    expect(screen.getAllByPlaceholderText('Qty').map(i => (i as HTMLInputElement).value)).toEqual(['3', '2']);
    expect(value('Order date')).toBe('2026-10-10');
    expect(value(/Customer/)).toBe('Anita');
    expect(value(/Phone/)).toBe('+91 98450 10101');
    expect(value(/Delivery address/)).toBe('12 MG Road');
    expect(value(/Discount/)).toBe('25');
    expect(value(/Paid by/)).toBe('upi');
    expect(screen.getByText('₹235.00')).toBeTruthy(); // 3*20 + 2*100 - 25
    expect(screen.getByText(/Filled from your message/)).toBeTruthy();
  });

  it('saves nothing until Add Order is pressed, and then saves what is in the form', async () => {
    const { onSave } = renderModal(form({ lineItems: [{ menuItemId: 'cake', quantity: 2 }], customerName: 'Anita', deliveryAddress: '12 MG Road' }));
    paste('2 cakes for Anita, deliver to 12 MG Road');
    await fill();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ customerName: 'Anita', deliveryAddress: '12 MG Road', paymentStatus: 'paid' });
    expect(onSave.mock.calls[0][1]).toEqual([{ menuItemId: 'cake', quantity: 2 }]);
  });

  it('selects pay later, and shows no payment method for it', async () => {
    renderModal(form({ lineItems: [{ menuItemId: 'cake', quantity: 1 }], payLater: true }));
    paste('1 cake, will pay on delivery');
    await fill();
    expect((screen.getByRole('radio', { name: 'Pay later' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText(/Paid by/)).toBeNull();
  });

  it('shows an item it could not find, with a suggestion that adds it only when accepted', async () => {
    renderModal(form({
      lineItems: [{ menuItemId: 'cake', quantity: 1 }],
      notFound: [{ nameAsWritten: 'cokies', quantity: 4, suggestion: { id: 'cookie', name: 'Butter Cookie' } }],
    }));
    paste('a cake and 4 cokies');
    await fill();
    expect(screen.getByText(/Couldn.t find .cokies. on the menu/)).toBeTruthy();
    expect(itemSelects()).toHaveLength(1); // not added yet
    fireEvent.click(screen.getByRole('button', { name: 'Use Butter Cookie?' }));
    expect(itemSelects().map(s => s.value)).toEqual(['cake', 'cookie']);
    expect((screen.getAllByPlaceholderText('Qty')[1] as HTMLInputElement).value).toBe('4');
    expect(screen.queryByText(/Couldn.t find .cokies./)).toBeNull();
  });

  it('adds to a row that is already there when the suggestion is for the same item', async () => {
    renderModal(form({
      lineItems: [{ menuItemId: 'cookie', quantity: 2 }],
      notFound: [{ nameAsWritten: 'cokies', quantity: 4, suggestion: { id: 'cookie', name: 'Butter Cookie' } }],
    }));
    paste('2 cookies and 4 cokies');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Use Butter Cookie?' }));
    expect(itemSelects()).toHaveLength(1);
    expect((screen.getByPlaceholderText('Qty') as HTMLInputElement).value).toBe('6');
  });

  it('leaves an empty row to choose from, not the first menu item, when nothing matched', async () => {
    renderModal(form({ notFound: [{ nameAsWritten: 'cheesecake', quantity: 1, suggestion: null }] }));
    paste('a cheesecake');
    await fill();
    expect(screen.getByText(/Couldn.t find .cheesecake./)).toBeTruthy();
    expect(screen.getByText('Pick it from the list below.')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Item' }) as HTMLSelectElement).value).toBe('');
  });

  it('replaces that empty row when a suggestion is accepted', async () => {
    renderModal(form({ notFound: [{ nameAsWritten: 'cokies', quantity: 3, suggestion: { id: 'cookie', name: 'Butter Cookie' } }] }));
    paste('3 cokies');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Use Butter Cookie?' }));
    const selects = itemSelects();
    expect(selects).toHaveLength(1);
    expect(selects[0].value).toBe('cookie');
    expect((screen.getByPlaceholderText('Qty') as HTMLInputElement).value).toBe('3');
  });

  it('says so when a date could not be read, and when the customer is one that is already known', async () => {
    renderModal(form({ lineItems: [{ menuItemId: 'cake', quantity: 1 }], dateNotUnderstood: 'sometime soon', knownCustomer: true, customerName: 'Priya Sharma' }));
    paste('a cake sometime soon');
    await fill();
    expect(screen.getByText(/Couldn.t tell the date from .sometime soon./)).toBeTruthy();
    expect(screen.getByText(/looks like an existing customer/)).toBeTruthy();
    expect(value(/Customer/)).toBe('Priya Sharma');
  });

  it('shows why when the message could not be read, and leaves the form as it was', async () => {
    renderModal({ ok: false, message: 'I could not read that message reliably. Please fill in the order by hand.' });
    paste('???');
    await fill();
    expect(screen.getByRole('alert').textContent).toMatch(/could not read that message reliably/);
    expect(itemSelects()).toHaveLength(1);
    expect(value(/Customer/)).toBe('');
  });

  it('does not run twice at once', async () => {
    let release: (o: OrderParseOutcome) => void = () => {};
    const parse = vi.fn(() => new Promise<OrderParseOutcome>(r => { release = r; }));
    render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={vi.fn()} currency={currency} orderParser={{ parse }} />);
    paste('2 cakes');
    fireEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    expect(screen.getByText('Reading…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reading/ }));
    expect(parse).toHaveBeenCalledTimes(1);
    release({ ok: true, form: { lineItems: [], notFound: [], knownCustomer: false } });
    await waitFor(() => expect(screen.queryByText('Reading…')).toBeNull());
  });

  it('clears the message, notes and address when the modal is closed', async () => {
    const onClose = vi.fn();
    const parse = vi.fn().mockResolvedValue(form({ lineItems: [{ menuItemId: 'cake', quantity: 1 }], deliveryAddress: '12 MG Road' }));
    const { rerender } = render(<AddOrderModal isOpen onClose={onClose} menu={menu as any} onSave={vi.fn()} currency={currency} orderParser={{ parse }} />);
    paste('a cake');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<AddOrderModal isOpen onClose={onClose} menu={menu as any} onSave={vi.fn()} currency={currency} orderParser={{ parse }} />);
    expect((screen.getByLabelText(/Fill from a message/) as HTMLTextAreaElement).value).toBe('');
    expect(value(/Delivery address/)).toBe('');
    expect(screen.queryByText(/Filled from your message/)).toBeNull();
  });
});
