import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemPartsEditor } from '../ItemPartsEditor';
import type { MenuItem, RawMaterial } from '../../types';

const cream = { id: 'cream', name: 'Cream', unit: 'ml', costPerUnit: 0.4, category: 'Raw Materials', initialStock: 0, dateAdded: '2026-01-01' } as RawMaterial;
// 500 ml of cream in a kg of ganache: ₹200 a kg.
const ganache: MenuItem = { id: 'ganache', name: 'Ganache', sellingPrice: 0, notForSale: true, countedIn: 'kg', recipe: [{ materialId: 'cream', amount: 500, unit: 'ml' }] };
const base: MenuItem = { id: 'base', name: 'Sponge base', sellingPrice: 0, notForSale: true, recipe: [] };
const cake: MenuItem = { id: 'cake', name: 'Truffle cake', sellingPrice: 900, recipe: [] };

const renderEditor = (item: MenuItem) => {
  const onChange = vi.fn();
  const menu = [ganache, base, item];
  render(<ItemPartsEditor item={item} menu={menu} costed={new Map(menu.map(m => [m.id, m]))} materials={[cream]} currencySymbol="₹" onChange={onChange} />);
  return onChange;
};

describe('ItemPartsEditor', () => {
  it('takes an item counted by weight in grams, and keeps it in kg', () => {
    const onChange = renderEditor({ ...cake, parts: [{ itemId: 'ganache', quantity: 0.15 }] });
    const box = screen.getByLabelText('How much Ganache goes into one, in g') as HTMLInputElement;
    expect(box.value).toBe('150');
    expect(screen.getByText('₹30.00')).toBeTruthy(); // 0.15 kg × ₹200
    fireEvent.change(box, { target: { value: '200' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenLastCalledWith([{ itemId: 'ganache', quantity: 0.2 }]);
  });

  it('adds 100 g of something counted by weight, and one of something counted in pieces', () => {
    const onChange = renderEditor(cake);
    fireEvent.change(screen.getByLabelText('Add a made item'), { target: { value: 'ganache' } });
    expect(onChange).toHaveBeenLastCalledWith([{ itemId: 'ganache', quantity: 0.1 }]);
    fireEvent.change(screen.getByLabelText('Add a made item'), { target: { value: 'base' } });
    expect(onChange).toHaveBeenLastCalledWith([{ itemId: 'base', quantity: 1 }]);
  });

  it('keeps pieces as they are', () => {
    renderEditor({ ...cake, parts: [{ itemId: 'base', quantity: 0.5 }] });
    expect((screen.getByLabelText('How many Sponge base go into one') as HTMLInputElement).value).toBe('0.5');
    expect(screen.getByText(/Use 0.5 for half/)).toBeTruthy();
  });
});
