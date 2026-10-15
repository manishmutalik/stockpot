import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setDoc = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: vi.fn(),
  deleteField: () => 'DELETE',
}));

import { useMenuActions } from '../useMenuActions';
import type { MenuItem } from '../../types';

const ganache: MenuItem = { id: 'ganache', name: 'Chocolate ganache', sellingPrice: 0, notForSale: true, recipe: [] };
const cake: MenuItem = { id: 'cake', name: 'Truffle cake', sellingPrice: 900, recipe: [] };
const setup = (menu: MenuItem[]) => {
  const showAlert = vi.fn();
  const h = renderHook(() => useMenuActions(menu, [], [], showAlert, { today: () => '2026-10-15' })).result.current;
  return { h, showAlert };
};

describe('counting an item by weight', () => {
  beforeEach(() => { setDoc.mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('counts an item made for other items in kg, and back in pieces', async () => {
    const { h } = setup([ganache]);
    await h.setCountedIn('ganache', 'kg');
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/user1/menu/ganache' }, { countedIn: 'kg' }, { merge: true });
    setDoc.mockClear();
    const { h: h2 } = setup([{ ...ganache, countedIn: 'kg' }]);
    await h2.setCountedIn('ganache', null);
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/user1/menu/ganache' }, { countedIn: 'DELETE' }, { merge: true });
  });

  it('keeps items sold on the menu in pieces', async () => {
    const { h, showAlert } = setup([cake]);
    await h.setCountedIn('cake', 'kg');
    expect(setDoc).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not yet', expect.stringMatching(/Sold on the menu/));
  });

  it('will not put an item counted by weight on the menu', async () => {
    const { h, showAlert } = setup([{ ...ganache, countedIn: 'kg' }]);
    await h.updateMenuItemField('ganache', 'notForSale', false);
    expect(setDoc).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not yet', expect.stringMatching(/counted in kg/));
  });

  it('is refused while another item uses it, naming it', async () => {
    const { h, showAlert } = setup([ganache, { ...cake, parts: [{ itemId: 'ganache', quantity: 1 }] }]);
    await h.setCountedIn('ganache', 'kg');
    expect(setDoc).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Used in other items', expect.stringMatching(/^Truffle cake uses Chocolate ganache, in pieces/));
  });

  it('turns a recipe per piece back into the whole batch, and clears a batch size that cannot carry over', async () => {
    // Made as 4 pieces a batch, 50 g of cream each: the whole batch is 200 g of cream.
    const { h } = setup([{ ...ganache, batchMakes: 4, recipe: [{ materialId: 'cream', amount: 50, unit: 'g' }] }]);
    await h.setCountedIn('ganache', 'kg');
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/user1/menu/ganache' }, { countedIn: 'kg', recipe: [{ materialId: 'cream', amount: 200, unit: 'g' }], batchMakes: 'DELETE' }, { merge: true });
  });

  it('clears stock counted the old way once the owner agrees', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { h } = setup([{ ...ganache, finishedGoodsStock: 3 }]);
    await h.setCountedIn('ganache', 'kg');
    expect(setDoc).not.toHaveBeenCalled();
    expect(confirm.mock.calls[0][0]).toMatch(/has 3 pieces in stock/);
    await h.setCountedIn('ganache', 'kg');
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/user1/menu/ganache' }, { countedIn: 'kg', finishedGoodsStock: 0 }, { merge: true });
  });
});
