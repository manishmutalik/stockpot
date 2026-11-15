import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MergeMaterialsModal } from '../MergeMaterialsModal';
import type { MenuItem, RawMaterial } from '../../types';

const mk = (id: string, name: string, over: Partial<RawMaterial> = {}) =>
  ({ id, name, unit: 'g', initialStock: 0, costPerUnit: 0, category: 'Raw Materials', dateAdded: '2026-03-01', ...over }) as RawMaterial;
const sugar = mk('sugar', 'Sugar', { unit: 'kg', initialStock: 2, costPerUnit: 40, dateAdded: '2026-01-01' });
const chini = mk('chini', 'Chini', { initialStock: 500, costPerUnit: 0.05 });
const jaggery = mk('jaggery', 'Jaggery', { unit: 'kg', initialStock: 1, costPerUnit: 80 });
const eggs = mk('eggs', 'Eggs', { unit: 'pcs', initialStock: 30, costPerUnit: 7 });
const menu = [{ id: 'cake', name: 'Cake', sellingPrice: 500, recipe: [{ materialId: 'chini', amount: 50, unit: 'g' }] }] as MenuItem[];

const open = (from: RawMaterial, onMerge = vi.fn().mockResolvedValue(true), otherId?: string) => {
  const onClose = vi.fn();
  render(<MergeMaterialsModal from={from} otherId={otherId} materials={[sugar, chini, jaggery, eggs]} menu={menu} experiments={[]} orders={[]} wastageLogs={[]} priceLog={[]} currencySymbol="₹" onMerge={onMerge} onClose={onClose} />);
  return { onMerge, onClose };
};

describe('MergeMaterialsModal', () => {
  it('starts with the item that looks the same, offers only items counted the same way, and keeps the one recipes use', () => {
    open(sugar);
    const select = screen.getByLabelText('Merge Sugar with') as HTMLSelectElement;
    expect(select.value).toBe('chini');
    expect([...select.options].map(o => o.textContent)).toEqual(['Chini (Raw Materials)', 'Jaggery (Raw Materials)']);
    // Chini is in a recipe, so it is kept by default.
    expect((screen.getByRole('radio', { name: /^Chini/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('says what will happen, and merges only when Merge is pressed', async () => {
    const { onMerge, onClose } = open(sugar);
    fireEvent.click(screen.getByRole('radio', { name: /^Sugar/ }));
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Chini becomes part of Sugar:');
    expect(status.textContent).toContain('Stock: 2 kg + 500 g = 2.5 kg.');
    expect(status.textContent).toContain('Moves to Sugar: 1 recipe.');
    expect(status.textContent).toContain('Chini is then deleted. This cannot be undone.');
    expect(onMerge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('sugar', 'chini');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open if the merge did not go through', async () => {
    const { onClose } = open(sugar, vi.fn().mockResolvedValue(false));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('starts with the item it was opened for, and Cancel closes without merging', () => {
    const { onMerge, onClose } = open(sugar, undefined, 'jaggery');
    expect((screen.getByLabelText('Merge Sugar with') as HTMLSelectElement).value).toBe('jaggery');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onMerge).not.toHaveBeenCalled();
  });

  it('says when nothing is counted the same way', () => {
    open(eggs);
    expect(screen.getByText(/nothing to merge it with/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Merge' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
