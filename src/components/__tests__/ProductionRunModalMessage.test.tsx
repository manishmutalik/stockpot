import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductionRunModal } from '../ProductionRunModal';

const menu = [
  { id: 'cake', name: 'Cake', recipe: [], sellingPrice: 20 },
  { id: 'cookie', name: 'Cookie', recipe: [], sellingPrice: 5 },
];
const currency = { symbol: '$' };
const form = (over: Record<string, unknown> = {}) => ({ rows: [], notFound: [], unplacedWaste: [], ...over });

function renderModal(parserForm: any | null, onSave = vi.fn().mockResolvedValue({ succeededCount: 1, failedIndex: null })) {
  const parse = vi.fn().mockResolvedValue({ ok: true, form: parserForm });
  const parser = parserForm === null ? null : { parse };
  render(<ProductionRunModal isOpen onClose={vi.fn()} menu={menu as any} materials={[]} onSave={onSave} currency={currency} productionParser={parser} />);
  return { onSave, parse };
}
const paste = (text: string) => fireEvent.change(screen.getByLabelText(/Fill from a note/), { target: { value: text } });
const fill = async () => { fireEvent.click(screen.getByRole('button', { name: 'Fill the form' })); await waitFor(() => expect(screen.queryByText('Reading…')).toBeNull()); };
const recipes = () => screen.getAllByRole('combobox').filter(el => (el as HTMLSelectElement).options[0]?.text === 'Select a recipe...') as HTMLSelectElement[];
const quantities = () => screen.getAllByPlaceholderText('Qty').map(i => (i as HTMLInputElement).value);

describe('filling the production form from a note', () => {
  it('is not offered when AI is not available', () => {
    renderModal(null);
    expect(screen.queryByLabelText(/Fill from a note/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fill the form' })).toBeNull();
  });

  it('is offered when it is, and needs a note first', () => {
    renderModal(form());
    expect((screen.getByRole('button', { name: 'Fill the form' }) as HTMLButtonElement).disabled).toBe(true);
    paste('Made 12 cookies');
    expect((screen.getByRole('button', { name: 'Fill the form' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the note as typed and pre-fills the items, quantities, date and notes', async () => {
    const { parse } = renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }, { recipeId: 'cake', quantity: 2 }], date: '2026-09-30', notes: 'new oven' }));
    paste('Made 12 cookies and 2 cakes on Wednesday, new oven');
    await fill();
    expect(parse).toHaveBeenCalledWith('Made 12 cookies and 2 cakes on Wednesday, new oven');
    expect(recipes().map(s => s.value)).toEqual(['cookie', 'cake']);
    expect(quantities()).toEqual(['12', '2']);
    expect((screen.getByDisplayValue('2026-09-30') as HTMLInputElement).type).toBe('date');
    expect(screen.queryByText(/Filled from your note/)).not.toBeNull();
  });

  it('saves nothing until Log is pressed, and then saves what is in the form', async () => {
    const { onSave } = renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }], date: '2026-09-30' }));
    paste('Made 12 cookies');
    await fill();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject([{ recipeId: 'cookie', quantityProduced: 12, quantityYield: 12, date: '2026-09-30' }]);
  });

  it('fills the sellable yield from the waste for a single item, and saves it', async () => {
    const { onSave } = renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }], yieldQty: 10 }));
    paste('Made 12 cookies, 2 burnt');
    await fill();
    expect((screen.getByLabelText(/Sellable units/) as HTMLInputElement).value).toBe('10');
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ quantityProduced: 12, quantityYield: 10 });
  });

  it('says where to record waste it cannot place, for several items', async () => {
    renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }, { recipeId: 'cake', quantity: 2 }], unplacedWaste: [{ name: 'Cookie', units: 2 }] }));
    paste('Made 12 cookies and 2 cakes, 2 cookies burnt');
    await fill();
    expect(screen.getByText(/2 Cookie were wasted\. Waste is entered here only for a single item/)).toBeTruthy();
    expect(screen.queryByLabelText(/Sellable units/)).toBeNull();
  });

  it('says so when the date could not be understood, and keeps today\'s', async () => {
    renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }], dateNotUnderstood: 'tomorrow' }));
    paste('Made 12 cookies tomorrow');
    await fill();
    expect(screen.getByText(/Couldn't tell the date from "tomorrow"/)).toBeTruthy();
  });

  it('shows an item that is not on the menu with a suggestion that is applied only when chosen', async () => {
    renderModal(form({ notFound: [{ nameAsWritten: 'cookiez', quantity: 12, suggestion: { id: 'cookie', name: 'Cookie' } }] }));
    paste('Made 12 cookiez');
    await fill();
    expect(screen.getByText(/Couldn't find “cookiez” on the menu \(×12\)/)).toBeTruthy();
    // Nothing stands in for it: the row is left empty to choose from.
    expect(recipes()[0].value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Use Cookie?' }));
    expect(recipes().map(s => s.value)).toEqual(['cookie']);
    expect(quantities()).toEqual(['12']);
    expect(screen.queryByText(/Couldn't find/)).toBeNull();
  });

  it('says when it found no items', async () => {
    renderModal(form());
    paste('Nothing today');
    await fill();
    expect(screen.getByText('No items were found in the note.')).toBeTruthy();
    expect(recipes()[0].value).toBe('');
  });

  it('shows the reason when the note could not be read, and leaves the form as it was', async () => {
    const parse = vi.fn().mockResolvedValue({ ok: false, message: 'I could not read that note reliably.' });
    render(<ProductionRunModal isOpen onClose={vi.fn()} menu={menu as any} materials={[]} onSave={vi.fn()} currency={currency} productionParser={{ parse }} />);
    paste('???');
    await fill();
    expect(screen.getByRole('alert').textContent).toBe('I could not read that note reliably.');
    expect(recipes()[0].value).toBe('cake');
  });

  it('is cleared on a full save, so the next run starts blank', async () => {
    const { onSave } = renderModal(form({ rows: [{ recipeId: 'cookie', quantity: 12 }] }));
    paste('Made 12 cookies');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Log Run' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect((screen.getByLabelText(/Fill from a note/) as HTMLTextAreaElement).value).toBe(''));
    expect(screen.queryByText(/Filled from your note/)).toBeNull();
  });
});
