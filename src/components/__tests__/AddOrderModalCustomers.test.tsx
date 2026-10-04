import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AddOrderModal } from '../AddOrderModal';
import type { CustomerSuggestion } from '../../utils/customers';

const menu = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, finishedGoodsStock: 10 },
  { id: 'cookie', name: 'Butter Cookie', sellingPrice: 20, finishedGoodsStock: 10 },
];
const TODAY = '2026-10-04';
const directory: CustomerSuggestion[] = [
  { key: 'phone:9845010101', name: 'Priya Sharma', phone: '+91 98450 10101', lastOrder: '2026-09-22', orderCount: 4, favouriteItem: 'Chocolate Truffle Cake' },
  { key: 'phone:9845020202', name: 'Priyanka Rao', phone: '98450 20202', lastOrder: '2026-10-03', orderCount: 2 },
  { key: 'name:anita', name: 'Anita', lastOrder: '2026-10-04', orderCount: 1 },
  { key: 'phone:9845030303', name: '', phone: '9845030303', lastOrder: '2026-10-01', orderCount: 1 },
];

function renderModal(over: Record<string, any> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={onSave} currency={{ symbol: '₹' }} customers={directory} today={TODAY} {...over} />);
  return { onSave };
}
const nameInput = () => screen.getByLabelText(/Customer/) as HTMLInputElement;
const phoneInput = () => screen.getByLabelText(/Phone/) as HTMLInputElement;
const type = (el: HTMLElement, value: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value } }); };
// The suggestions only: the item pickers' own <option>s are not.
const options = () => { const list = screen.queryByRole('listbox'); return list ? within(list).queryAllByRole('option') : []; };

describe('suggestions while typing a name', () => {
  it('lists matching past customers with their phone, last order and usual item, most recent order first', () => {
    renderModal();
    type(nameInput(), 'pri');
    const rows = options();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Priyanka Rao');
    expect(rows[0].textContent).toContain('98450 20202');
    expect(rows[0].textContent).toContain('Last order yesterday');
    expect(rows[1].textContent).toContain('Priya Sharma');
    expect(rows[1].textContent).toContain('Last order 12 days ago · usually Chocolate Truffle Cake');
  });

  it('says "no phone" for a customer known only by name, and "today" for an order today', () => {
    renderModal();
    type(nameInput(), 'ani');
    expect(options()[0].textContent).toContain('no phone');
    expect(options()[0].textContent).toContain('Last order today');
  });

  it('shows nothing when nothing matches, and the field behaves as before', async () => {
    const { onSave } = renderModal();
    type(nameInput(), 'Zainab');
    expect(options()).toHaveLength(0);
    expect(screen.queryByRole('listbox', { hidden: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ customerName: 'Zainab' });
    expect(onSave.mock.calls[0][0].customerPhone).toBeUndefined();
  });

  it('behaves exactly as before with no past customers', () => {
    renderModal({ customers: [] });
    type(nameInput(), 'pri');
    expect(options()).toHaveLength(0);
    expect(nameInput().value).toBe('pri');
  });

  it('does not open from a change the owner did not type', () => {
    const { rerender } = render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={vi.fn()} currency={{ symbol: '₹' }} customers={directory} today={TODAY} />);
    rerender(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={vi.fn()} currency={{ symbol: '₹' }} customers={[...directory]} today={TODAY} />);
    expect(options()).toHaveLength(0);
    expect(nameInput().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('picking a suggestion', () => {
  it('fills both the name and the phone, and closes the list', () => {
    renderModal();
    type(nameInput(), 'priya s');
    fireEvent.mouseDown(options()[0]);
    expect(nameInput().value).toBe('Priya Sharma');
    expect(phoneInput().value).toBe('+91 98450 10101');
    expect(options()).toHaveLength(0);
  });

  it('replaces a different number already in the phone field', () => {
    renderModal();
    type(phoneInput(), '99999 00000');
    type(nameInput(), 'priya s');
    fireEvent.mouseDown(options()[0]);
    expect(phoneInput().value).toBe('+91 98450 10101');
  });

  it('moves on to the first item, and does not lock the fields', () => {
    renderModal();
    type(nameInput(), 'priya s');
    fireEvent.mouseDown(options()[0]);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Item' }));
    fireEvent.change(phoneInput(), { target: { value: '+91 77777 66666' } });
    expect(phoneInput().value).toBe('+91 77777 66666');
  });

  it('clears the name when the customer picked is known only by phone, and clears the phone when known only by name', () => {
    renderModal();
    type(nameInput(), 'ani');
    fireEvent.mouseDown(options()[0]);
    expect(nameInput().value).toBe('Anita');
    expect(phoneInput().value).toBe('');
  });

  it('saves the order under the picked customer', async () => {
    const { onSave } = renderModal();
    type(nameInput(), 'priya s');
    fireEvent.mouseDown(options()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add Order' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ customerName: 'Priya Sharma', customerPhone: '+91 98450 10101' });
  });
});

describe('suggestions while typing a phone number', () => {
  it('waits for three digits, then lists matches, ignoring +91 and spaces', () => {
    renderModal();
    type(phoneInput(), '98');
    expect(options()).toHaveLength(0);
    type(phoneInput(), '+91 98450 1');
    expect(options().map(o => o.textContent)).toEqual([expect.stringContaining('Priya Sharma')]);
  });

  it('picking one fills the name too', () => {
    renderModal();
    type(phoneInput(), '98450 2');
    fireEvent.mouseDown(options()[0]);
    expect(nameInput().value).toBe('Priyanka Rao');
    expect(phoneInput().value).toBe('98450 20202');
  });

  it('shows a customer known only by phone as "Customer not named", and picking leaves the name empty', () => {
    renderModal();
    type(phoneInput(), '98450 3');
    expect(options()[0].textContent).toContain('Customer not named');
    fireEvent.mouseDown(options()[0]);
    expect(nameInput().value).toBe('');
    expect(phoneInput().value).toBe('9845030303');
  });
});

describe('the keyboard', () => {
  it('moves the highlight with the arrow keys, wrapping round, and picks with Enter', () => {
    renderModal();
    type(nameInput(), 'pri');
    expect(options().every(o => o.getAttribute('aria-selected') === 'false')).toBe(true); // nothing highlighted yet
    fireEvent.keyDown(nameInput(), { key: 'ArrowDown' });
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(nameInput(), { key: 'ArrowDown' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(nameInput(), { key: 'ArrowDown' });
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(nameInput(), { key: 'ArrowUp' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    expect(nameInput().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    const enter = fireEvent.keyDown(nameInput(), { key: 'Enter' });
    expect(enter).toBe(false); // default prevented: Enter must not also do what it does in the form
    expect(nameInput().value).toBe('Priya Sharma');
    expect(phoneInput().value).toBe('+91 98450 10101');
  });

  it('starts from the last row with the up arrow', () => {
    renderModal();
    type(nameInput(), 'pri');
    fireEvent.keyDown(nameInput(), { key: 'ArrowUp' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('never picks anything on Enter when nothing is highlighted: a new name stays a new customer', () => {
    renderModal();
    type(nameInput(), 'Priya');
    const enter = fireEvent.keyDown(nameInput(), { key: 'Enter' });
    expect(enter).toBe(true); // not intercepted
    expect(nameInput().value).toBe('Priya');
    expect(phoneInput().value).toBe('');
  });

  it('closes on Escape without picking, and the modal stays', () => {
    renderModal();
    type(nameInput(), 'pri');
    fireEvent.keyDown(nameInput(), { key: 'ArrowDown' });
    fireEvent.keyDown(nameInput(), { key: 'Escape' });
    expect(options()).toHaveLength(0);
    expect(nameInput().value).toBe('pri');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reopens with the down arrow after Escape', () => {
    renderModal();
    type(nameInput(), 'pri');
    fireEvent.keyDown(nameInput(), { key: 'Escape' });
    fireEvent.keyDown(nameInput(), { key: 'ArrowDown' });
    expect(options()).toHaveLength(2);
  });

  it('closes when the field loses focus (Tab), without selecting', () => {
    renderModal();
    type(nameInput(), 'pri');
    fireEvent.blur(nameInput());
    expect(options()).toHaveLength(0);
    expect(nameInput().value).toBe('pri');
    expect(phoneInput().value).toBe('');
  });

  it('highlights the row under the mouse', () => {
    renderModal();
    type(nameInput(), 'pri');
    fireEvent.mouseEnter(options()[1]);
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });
});

describe('accessibility', () => {
  it('uses the combobox pattern on both fields', () => {
    renderModal();
    for (const input of [nameInput(), phoneInput()]) {
      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('autocomplete')).toBe('off');
      expect(input.getAttribute('aria-autocomplete')).toBe('list');
      expect(input.getAttribute('aria-expanded')).toBe('false');
    }
    type(nameInput(), 'pri');
    const list = screen.getByRole('listbox');
    expect(nameInput().getAttribute('aria-expanded')).toBe('true');
    expect(nameInput().getAttribute('aria-controls')).toBe(list.id);
    expect(within(list).getAllByRole('option')).toHaveLength(2);
  });
});
