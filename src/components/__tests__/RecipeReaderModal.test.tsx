import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RecipeReaderModal } from '../RecipeReaderModal';
import type { RecipeReader } from '../../hooks/useRecipeReader';
import type { MenuItem, RawMaterial } from '../../types';
import type { ParsedRecipes } from '../../utils/recipeParse';

const mat = (id: string, name: string, unit: string, costPerUnit: number): RawMaterial => ({ id, name, unit, costPerUnit, initialStock: 0, category: 'Raw Materials', dateAdded: '2026-01-01' });
const materials = [mat('m_flour', 'Maida', 'kg', 45), mat('m_chips', 'Chocolate Chips', 'kg', 600)];
const menu: MenuItem[] = [];

const parsed: ParsedRecipes = {
  moreNotRead: false,
  recipes: [
    {
      name: 'Choco Chip Cookies', makesAsWritten: 'makes 20', makes: 20, looksLikeComponent: false, looksCutOff: false,
      ingredients: [
        { nameAsWritten: 'maida', amountAsWritten: '2', amount: 2, unitAsWritten: 'cups', unit: 'cup', kind: 'other', materialId: 'm_flour', unclear: false },
        { nameAsWritten: 'choco chips', amountAsWritten: '1', amount: 1, unitAsWritten: 'cup', unit: 'cup', kind: 'other', materialId: 'm_chips', unclear: false },
        { nameAsWritten: 'elaichi powder', amountAsWritten: '1/2', amount: 0.5, unitAsWritten: 'tsp', unit: 'tsp', kind: 'ground_spice', materialId: null, unclear: true },
      ],
    },
    {
      name: 'Chocolate ganache', looksLikeComponent: true, looksCutOff: false,
      ingredients: [{ nameAsWritten: 'cream', amountAsWritten: '100', amount: 100, unitAsWritten: 'ml', unit: 'ml', kind: 'other', materialId: null, unclear: false }],
    },
  ],
};

const reader = (outcome = { ok: true as const, parsed, remaining: 13 }): RecipeReader => ({ remaining: 15, read: vi.fn().mockResolvedValue(outcome) });
const open = (r = reader(), onSave = vi.fn().mockResolvedValue({ ok: true, count: 1 })) => {
  render(<RecipeReaderModal reader={r} materials={materials} menu={menu} currency="₹" onClose={() => {}} onSave={onSave} />);
  return { r, onSave };
};
const readText = async () => {
  fireEvent.click(screen.getByRole('tab', { name: /Type or paste/ }));
  fireEvent.change(screen.getByLabelText('Recipe'), { target: { value: 'Butter cookies...' } });
  fireEvent.click(screen.getByRole('button', { name: 'Read recipe' }));
  await screen.findByRole('region', { name: 'Choco Chip Cookies' });
};

describe('RecipeReaderModal', () => {
  it('reads typed text and shows each recipe, with what is left to read', async () => {
    const { r } = open();
    expect(screen.getByText('15 recipes left to read today.')).toBeTruthy();
    await readText();
    expect(r.read).toHaveBeenCalledWith({ text: 'Butter cookies...' }, materials);
    expect(screen.getByRole('region', { name: 'Chocolate ganache' })).toBeTruthy();
    // The unclear line is flagged; the new spice is a new material, weighed with the table's typical weight
    expect(screen.getByText('Hard to read: check')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'New materials' })).getAllByLabelText('New material name').map(i => (i as HTMLInputElement).value)).toEqual(['Elaichi powder', 'Cream']);
  });

  it('will not save until every question is answered, then saves the settled recipes', async () => {
    const { onSave } = open();
    await readText();
    const save = screen.getByRole('button', { name: 'Save 2 recipes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    // A cup of chocolate chips costs too much to guess: confirm its weight
    const cookies = screen.getByRole('region', { name: 'Choco Chip Cookies' });
    fireEvent.click(within(cookies).getByRole('button', { name: /Use 168 g/ }));
    // The ganache: part of the cookies, one batch covers 20
    const ganache = screen.getByRole('region', { name: 'Chocolate ganache' });
    fireEvent.click(within(ganache).getByLabelText('Mixed into another item each time'));
    fireEvent.change(within(ganache).getByLabelText('Part of'), { target: { value: 'recipe:r1' } });
    fireEvent.change(within(ganache).getByLabelText('One batch covers'), { target: { value: '20' } });

    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await screen.findByText('Recipe saved');
    const data = onSave.mock.calls[0][0];
    expect(data.items).toHaveLength(1);
    expect(data.items[0].target).toEqual({ kind: 'new', name: 'Choco Chip Cookies' });
    expect(data.items[0].lines.map((l: { amount: number }) => l.amount)).toEqual([12.48, 8.4, 0.05, 5]);
    expect(data.remember).toEqual([{ materialId: 'm_chips', gramsPerTsp: 3.5 }]);
  });

  it('saves a component made ahead and kept as its own item, used in the cookies, which are made when ordered', async () => {
    const { onSave } = open();
    await readText();
    const cookies = screen.getByRole('region', { name: 'Choco Chip Cookies' });
    fireEvent.click(within(cookies).getByRole('button', { name: /Use 168 g/ }));
    fireEvent.click(within(cookies).getByLabelText(/Made when ordered/));
    const ganache = screen.getByRole('region', { name: 'Chocolate ganache' });
    fireEvent.click(within(ganache).getByLabelText('Made ahead and kept'));
    fireEvent.change(within(ganache).getByLabelText('One batch makes'), { target: { value: '4' } });
    fireEvent.change(within(ganache).getByLabelText('Used in (optional)'), { target: { value: 'recipe:r1' } });
    fireEvent.change(within(ganache).getByLabelText('How many go into one'), { target: { value: '0.5' } });
    // The cookies' card shows the ganache going into each one.
    expect(within(cookies).getByText(/\+ 0\.5 Chocolate ganache/)).toBeTruthy();

    const save = screen.getByRole('button', { name: 'Save 2 recipes' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await screen.findByText('Recipe saved');
    const data = onSave.mock.calls[0][0];
    expect(data.items.map((i: { target: unknown }) => i.target)).toEqual([{ kind: 'new', name: 'Chocolate ganache' }, { kind: 'new', name: 'Choco Chip Cookies' }]);
    expect(data.items[0]).toMatchObject({ key: 'recipe:r2', notForSale: true, batchMakes: 4 });
    expect(data.items[1]).toMatchObject({ madeToOrder: true, parts: [{ item: { newKey: 'recipe:r2' }, quantity: 0.5 }] });
  });

  it('shows the reader\'s message when nothing could be read, and lets the owner try again', async () => {
    open(reader({ ok: false, message: 'No recipe was found in that.' } as never));
    fireEvent.click(screen.getByRole('tab', { name: /Type or paste/ }));
    fireEvent.change(screen.getByLabelText('Recipe'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read recipe' }));
    expect((await screen.findByRole('alert')).textContent).toBe('No recipe was found in that.');
    expect(screen.getByRole('button', { name: 'Read recipe' })).toBeTruthy();
  });

  it('cannot read when nothing is left for today', () => {
    open({ remaining: 0, read: vi.fn() });
    expect(screen.getByText(/You have read all the recipes you can for now/)).toBeTruthy();
  });
});
