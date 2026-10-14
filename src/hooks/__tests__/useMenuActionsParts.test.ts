import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setDoc = vi.fn();
const deleteDoc = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  deleteField: () => 'DELETE',
}));

import { useMenuActions } from '../useMenuActions';
import type { MenuItem, RawMaterial } from '../../types';

const materials = [{ id: 'gel', name: 'Cake gel', unit: 'kg', costPerUnit: 300, category: 'Raw Materials', initialStock: 0, dateAdded: '2026-01-01' }] as RawMaterial[];
const base: MenuItem = { id: 'base', name: 'Vanilla sponge base', sellingPrice: 0, notForSale: true, recipe: [{ materialId: 'gel', amount: 200, unit: 'g' }] };
const cake: MenuItem = { id: 'cake', name: 'Pineapple Cream Cake', sellingPrice: 900, recipe: [], parts: [{ itemId: 'base', quantity: 1 }] };
const half: MenuItem = { id: 'half', name: 'Pineapple Cream Cake ½ kg', sellingPrice: 500, recipe: [] };
const setup = (menu: MenuItem[]) => {
  const showAlert = vi.fn();
  const h = renderHook(() => useMenuActions(menu, materials, [], showAlert, { today: () => '2026-10-14' })).result.current;
  return { h, showAlert };
};

describe('parts in the menu actions', () => {
  beforeEach(() => { setDoc.mockClear(); deleteDoc.mockClear(); });

  it('saves an item\'s parts, dropping a quantity of nothing', async () => {
    const { h } = setup([base, cake, half]);
    await h.setItemParts('half', [{ itemId: 'base', quantity: 0.5 }, { itemId: 'cake', quantity: 0 }]);
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/user1/menu/half' }, { parts: [{ itemId: 'base', quantity: 0.5 }] }, { merge: true });
  });

  it('refuses a part that would put an item inside itself', async () => {
    const { h, showAlert } = setup([base, cake, half]);
    await h.setItemParts('base', [{ itemId: 'cake', quantity: 1 }]);
    expect(setDoc).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not possible', expect.stringMatching(/Pineapple Cream Cake already uses Vanilla sponge base/));
  });

  it('will not delete a base other items are made from, and says which', async () => {
    const { h, showAlert } = setup([base, cake, half]);
    await h.deleteMenuItem('base');
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Still in use', expect.stringMatching(/used in Pineapple Cream Cake/));
    await h.deleteMenuItem('half');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('copies the parts with Duplicate Recipe, and prices a cake with its base in the cost', async () => {
    const { h } = setup([base, cake]);
    await h.copyMenuItem(cake);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ name: 'Pineapple Cream Cake (Copy)', parts: [{ itemId: 'base', quantity: 1 }] });
    setDoc.mockClear();
    await h.updateMenuItemField('cake', 'sellingPrice', 950);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ costAtPricing: 60, materialCostsAtPricing: { gel: 300 } });
  });

  it('sets what one batch makes, keeping the recipe per one, or clears it', async () => {
    const { h } = setup([{ ...base, batchMakes: 4.5 }, cake]);
    await h.setBatchSize('base', 5);
    expect(setDoc).toHaveBeenLastCalledWith({ path: 'users/user1/menu/base' }, { batchMakes: 5 }, { merge: true });
    await h.setBatchSize('base', null);
    expect(setDoc).toHaveBeenLastCalledWith({ path: 'users/user1/menu/base' }, { batchMakes: 'DELETE' }, { merge: true });
  });

  it('uses what batches really make, keeping one batch\'s ingredients, or divides a recipe written for the whole batch', async () => {
    const { h } = setup([{ ...base, batchMakes: 4.5 }, cake]);
    await h.setBatchSize('base', 4, 'keep-batch');
    // 200 g a base for 4.5 is 900 g a batch: 225 g a base for 4.
    expect(setDoc).toHaveBeenLastCalledWith({ path: 'users/user1/menu/base' }, { batchMakes: 4, recipe: [{ materialId: 'gel', amount: 225, unit: 'g' }] }, { merge: true });
    const whole = setup([{ ...base, recipe: [{ materialId: 'gel', amount: 900, unit: 'g' }] }]).h;
    await whole.setBatchSize('base', 4.5, 'from-whole-batch');
    expect(setDoc).toHaveBeenLastCalledWith({ path: 'users/user1/menu/base' }, { batchMakes: 4.5, recipe: [{ materialId: 'gel', amount: 200, unit: 'g' }] }, { merge: true });
  });
});
