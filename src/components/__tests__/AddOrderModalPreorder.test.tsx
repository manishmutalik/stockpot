import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AddOrderModal } from '../AddOrderModal';

const TODAY = '2026-10-04';
const DUE = '2026-10-06';
const menu = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, finishedGoodsStock: 0 },
  { id: 'cookie', name: 'Butter Cookie', sellingPrice: 20, finishedGoodsStock: 10 },
];

function renderModal(over: Record<string, any> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<AddOrderModal isOpen onClose={onClose} menu={menu as any} onSave={onSave} currency={{ symbol: '₹' }} today={TODAY} {...over} />);
  return { onSave, onClose };
}
const dateInput = () => screen.getByLabelText(/Order date|Due date/) as HTMLInputElement;
const setDate = (d: string) => fireEvent.change(dateInput(), { target: { value: d } });
const mode = (name: 'From stock' | 'Pre-order') => screen.getByRole('radio', { name }) as HTMLButtonElement;
const isMode = (name: 'From stock' | 'Pre-order') => mode(name).getAttribute('aria-checked') === 'true';
const items = () => screen.getAllByRole('combobox', { name: /^Item/ }) as HTMLSelectElement[];
const book = () => fireEvent.click(screen.getByRole('button', { name: /^(Add Order|Book Pre-order)/ }));
const saved = (onSave: any) => ({ common: onSave.mock.calls[0][0], lines: onSave.mock.calls[0][1] });

afterEach(() => vi.restoreAllMocks());

describe('choosing From stock or Pre-order', () => {
  it('starts as an order from stock, dated today', () => {
    renderModal();
    expect(isMode('From stock')).toBe(true);
    expect(screen.getByLabelText('Order date')).toBeTruthy();
    expect(screen.queryByLabelText(/Notes/)).toBeNull();
    expect(screen.queryByLabelText('Advance amount')).toBeNull();
  });

  it('switches to Pre-order by itself when the date is after today, and back when it is not', () => {
    renderModal();
    setDate(DUE);
    expect(isMode('Pre-order')).toBe(true);
    expect(screen.getByLabelText('Due date')).toBeTruthy();
    setDate(TODAY);
    expect(isMode('From stock')).toBe(true);
  });

  it('keeps the owner\'s own choice: a date no longer changes it', () => {
    renderModal();
    fireEvent.click(mode('Pre-order'));
    setDate(TODAY);
    expect(isMode('Pre-order')).toBe(true); // a pre-order for today is fine
    fireEvent.click(mode('From stock'));
    setDate(DUE);
    expect(isMode('From stock')).toBe(true); // a future date from stock is fine too
  });

  it('shows the slot, notes and advance for a pre-order, and not before', () => {
    renderModal();
    fireEvent.click(mode('Pre-order'));
    expect(screen.getByLabelText(/Time of day/)).toBeTruthy();
    expect(screen.getByLabelText(/Notes/)).toBeTruthy();
    expect(screen.getByLabelText('Advance amount')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Book Pre-order' })).toBeTruthy();
    fireEvent.click(mode('From stock'));
    expect(screen.queryByLabelText('Advance amount')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Order' })).toBeTruthy();
  });

  it('a pre-order is usually paid at handover, so pay later is chosen for it, unless the owner chose', () => {
    renderModal();
    fireEvent.click(mode('Pre-order'));
    expect(screen.getByRole('radio', { name: 'Pay later' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('stock', () => {
  it('a pre-order books with nothing baked, and says which item is not baked yet', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    setDate(DUE);
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '3' } });
    expect(screen.getByText('0 on the shelf · not baked yet')).toBeTruthy();
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).common).toMatchObject({ preorder: true, date: DUE });
    expect(saved(onSave).lines).toEqual([{ menuItemId: 'cake', quantity: 3 }]);
  });

  it('an order from stock still stops at what is on the shelf', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    book();
    expect(await screen.findByText(/Only 0 unit\(s\) of "Chocolate Cake" in stock/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('the price on a line', () => {
  it('shows the menu price, and the line total', () => {
    renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '3' } });
    expect((screen.getByLabelText('Price of item') as HTMLInputElement).value).toBe('20');
    expect(screen.getByText('each = ₹60.00')).toBeTruthy();
    expect(screen.getByText('₹60.00', { selector: 'div' })).toBeTruthy();
  });

  it('a different price is the agreed price: it changes the total, and is sent with the line', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item'), { target: { value: '25.5' } });
    expect(screen.getByText('each = ₹25.50')).toBeTruthy();
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).lines).toEqual([{ menuItemId: 'cookie', quantity: 1, unitPrice: 25.5 }]);
  });

  it('sends no price when it is the menu price, even if it was retyped', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item'), { target: { value: '20' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).lines).toEqual([{ menuItemId: 'cookie', quantity: 1 }]);
  });

  it('goes back to the menu price when the item changes, and when the field is cleared', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item'), { target: { value: '99' } });
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    expect((screen.getByLabelText('Price of item') as HTMLInputElement).value).toBe('100');
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item'), { target: { value: '' } });
    expect(screen.getByText('each = ₹20.00')).toBeTruthy();
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).lines[0]).not.toHaveProperty('unitPrice');
  });

  it('refuses a price that is not a price', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item'), { target: { value: '-5' } });
    book();
    expect(await screen.findByText(/Please enter a price/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('prices every row on its own', async () => {
    const { onSave } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.click(screen.getByText('Add another item'));
    fireEvent.change(items()[1], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText('Price of item 1'), { target: { value: '30' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).lines).toEqual([{ menuItemId: 'cookie', quantity: 1, unitPrice: 30 }, { menuItemId: 'cookie', quantity: 1 }]);
  });
});

describe('booking details', () => {
  it('sends the slot, the notes and the advance', async () => {
    const { onSave } = renderModal();
    setDate(DUE);
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    fireEvent.change(screen.getByLabelText(/Time of day/), { target: { value: 'morning' } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: '  Happy birthday Asha  ' } });
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Advance paid by'), { target: { value: 'cash' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).common).toMatchObject({ preorder: true, dueSlot: 'morning', notes: 'Happy birthday Asha', advance: { amount: 40, method: 'cash' } });
  });

  it('sends a chosen time instead of a time of day, and needs one when "At a time" is picked', async () => {
    const { onSave } = renderModal();
    setDate(DUE);
    fireEvent.change(screen.getByLabelText(/Time of day/), { target: { value: 'time' } });
    book();
    expect(await screen.findByText(/Please choose the time/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '16:30' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).common.dueSlot).toBe('16:30');
  });

  it('sends no slot, notes or advance when none was given', async () => {
    const { onSave } = renderModal();
    setDate(DUE);
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const common = saved(onSave).common;
    expect(common.preorder).toBe(true);
    for (const key of ['dueSlot', 'notes', 'advance']) expect(common).not.toHaveProperty(key);
  });

  it('sends none of it for an order from stock, whatever was typed before switching back', async () => {
    const { onSave } = renderModal();
    fireEvent.click(mode('Pre-order'));
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'eggless' } });
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '40' } });
    fireEvent.click(mode('From stock'));
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    for (const key of ['preorder', 'dueSlot', 'notes', 'advance']) expect(saved(onSave).common).not.toHaveProperty(key);
  });
});

describe('the advance', () => {
  const preorderOf = (cakes = 2) => {
    const r = renderModal();
    setDate(DUE);
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: String(cakes) } });
    return r;
  };

  it('shows the balance left at handover, and hides the paid-now choice because the advance decides', () => {
    preorderOf(); // 200
    expect(screen.getByRole('radiogroup', { name: 'Payment' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '50' } });
    expect(screen.getByText(/Balance at handover: ₹150.00/)).toBeTruthy();
    expect(screen.getByText(/advance ₹50.00 · balance ₹150.00/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Payment' })).toBeNull();
  });

  it('says it is paid in full when the advance covers everything', () => {
    preorderOf();
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '200' } });
    expect(screen.getByText(/covers the whole order/)).toBeTruthy();
  });

  it('refuses an advance larger than the order, and one that is not a number above nothing', async () => {
    const { onSave } = preorderOf();
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '250' } });
    book();
    expect(await screen.findByText(/more than the order comes to/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '-3' } });
    book();
    expect(await screen.findByText(/must be more than nothing/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('counts GST when it is on, so a customer can pay the tax in advance too', async () => {
    const r = renderModal({ gst: { gstApplicable: true, gstRate: 10, gstPricingMode: 'exclusive' } });
    setDate(DUE);
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '220' } }); // 200 + 10%
    expect(screen.getByText(/covers the whole order/)).toBeTruthy();
    book();
    await waitFor(() => expect(r.onSave).toHaveBeenCalled());
  });

  it('takes the discount off before comparing', () => {
    preorderOf();
    fireEvent.change(screen.getByLabelText(/Discount/), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '150' } });
    expect(screen.getByText(/covers the whole order/)).toBeTruthy();
  });
});

describe('confirming a booked pre-order on WhatsApp', () => {
  const book2 = async (phone: string | null, extra?: () => void) => {
    const r = renderModal();
    setDate(DUE);
    fireEvent.change(items()[0], { target: { value: 'cake' } });
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Customer/), { target: { value: 'Priya' } });
    if (phone) fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: phone } });
    fireEvent.change(screen.getByLabelText(/Time of day/), { target: { value: 'morning' } });
    fireEvent.change(screen.getByLabelText('Advance amount'), { target: { value: '50' } });
    extra?.();
    book();
    await waitFor(() => expect(r.onSave).toHaveBeenCalled());
    return r;
  };

  it('offers to send the confirmation, with the message, instead of closing', async () => {
    const { onClose } = await book2('98450 10101');
    expect(await screen.findByText('Pre-order Booked')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Hi Priya, your order for 2 Chocolate Cake on Tue 6 Oct (morning) is confirmed. Advance received: ₹50.00. Balance: ₹150.00.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens WhatsApp with that message when sent', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await book2('98450 10101');
    fireEvent.click(await screen.findByRole('button', { name: 'Send confirmation' }));
    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0][0]);
    expect(url).toMatch(/^https:\/\/wa\.me\/919845010101\?text=/);
    expect(decodeURIComponent(url)).toContain('Balance: ₹150.00');
  });

  it('closes when done', async () => {
    const { onClose } = await book2('98450 10101');
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('just closes when the customer has no phone number, or the number cannot be used', async () => {
    const none = await book2(null);
    await waitFor(() => expect(none.onClose).toHaveBeenCalled());
  });

  it('just closes for an order from stock', async () => {
    const { onSave, onClose } = renderModal();
    fireEvent.change(items()[0], { target: { value: 'cookie' } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: '98450 10101' } });
    book();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText('Pre-order Booked')).toBeNull();
  });

  it('stays open, with the form, when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('no'));
    render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as any} onSave={onSave} currency={{ symbol: '₹' }} today={TODAY} />);
    setDate(DUE);
    book();
    expect(await screen.findByText(/Failed to add order/)).toBeTruthy();
    expect(screen.queryByText('Pre-order Booked')).toBeNull();
  });
});

describe('with the message filler', () => {
  const fillWith = async (form: Record<string, any>) => {
    const parse = vi.fn().mockResolvedValue({ ok: true, form: { lineItems: [{ menuItemId: 'cake', quantity: 1 }], notFound: [], knownCustomer: false, ...form } });
    renderModal({ orderParser: { parse } });
    fireEvent.change(screen.getByLabelText(/Fill from a message/), { target: { value: 'message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    await waitFor(() => expect(screen.queryByText('Reading…')).toBeNull());
  };

  it('notes and an advance read from the message fill their fields and make it a pre-order', async () => {
    await fillWith({ notes: 'Happy birthday Asha', advanceAmount: 40, advanceMethod: 'cash' });
    expect(isMode('Pre-order')).toBe(true);
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).value).toBe('Happy birthday Asha');
    expect((screen.getByLabelText('Advance amount') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Advance paid by') as HTMLSelectElement).value).toBe('cash');
    expect(screen.getByText(/because the message mentions an advance/)).toBeTruthy();
  });

  it('keeps the owner\'s choice of From stock when the message mentions an advance', async () => {
    const parse = vi.fn().mockResolvedValue({ ok: true, form: { lineItems: [{ menuItemId: 'cookie', quantity: 1 }], notFound: [], knownCustomer: false, advanceAmount: 5 } });
    renderModal({ orderParser: { parse } });
    fireEvent.click(mode('Pre-order'));
    fireEvent.click(mode('From stock'));
    fireEvent.change(screen.getByLabelText(/Fill from a message/), { target: { value: 'message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    await waitFor(() => expect(screen.queryByText('Reading…')).toBeNull());
    expect(isMode('From stock')).toBe(true);
  });

  it('a future date read from the message makes it a pre-order', async () => {
    const parse = vi.fn().mockResolvedValue({ ok: true, form: { lineItems: [{ menuItemId: 'cake', quantity: 1 }], notFound: [], knownCustomer: false, date: DUE } });
    renderModal({ orderParser: { parse } });
    fireEvent.change(screen.getByLabelText(/Fill from a message/), { target: { value: 'a cake for Tuesday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    await waitFor(() => expect(isMode('Pre-order')).toBe(true));
    expect(within(screen.getByRole('dialog')).getByLabelText('Due date')).toBeTruthy();
  });
});
