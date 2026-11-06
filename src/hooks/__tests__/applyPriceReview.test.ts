import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batch = { set: vi.fn(), commit: vi.fn() };
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  writeBatch: () => batch,
}));

import { useMenuActions } from '../useMenuActions';

const materials: any[] = [{ id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 800 }];
const line = [{ materialId: 'butter', amount: 100, unit: 'g' }];
const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 200, recipe: line, pricedAt: '2026-06-01', costAtPricing: 40, materialCostsAtPricing: { butter: 400 }, pricingIsBaseline: true },
  { id: 'brownie', name: 'Brownie', sellingPrice: 200, recipe: line, pricedAt: '2026-06-01', costAtPricing: 40, materialCostsAtPricing: { butter: 400 } },
];
const actions = () => renderHook(() => useMenuActions(menu, materials, [], vi.fn(), { today: () => '2026-11-02' })).result.current;

describe('applyPriceReview', () => {
  beforeEach(() => { batch.set.mockReset(); batch.commit.mockReset().mockResolvedValue(undefined); });

  it('writes each chosen price with a new stamp and the review date, in one batch', async () => {
    expect(await actions().applyPriceReview([{ menuItemId: 'cake', newPrice: 400 }])).toBe(true);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.set).toHaveBeenCalledWith('users/u1/menu/cake', {
      sellingPrice: 400, pricedAt: '2026-11-02', costAtPricing: 80, materialCostsAtPricing: { butter: 800 }, pricingIsBaseline: false,
    }, { merge: true });
    expect(batch.set).toHaveBeenCalledWith('users/u1/settings/bakery', { lastPriceReviewOn: '2026-11-02' }, { merge: true });
    expect(batch.set.mock.calls.some(c => c[0] === 'users/u1/menu/brownie')).toBe(false);
  });

  it('writes only the date when every price is kept', async () => {
    expect(await actions().applyPriceReview([])).toBe(true);
    expect(batch.set).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalledWith('users/u1/settings/bakery', { lastPriceReviewOn: '2026-11-02' }, { merge: true });
  });

  it('costs an item through its parts when stamping', async () => {
    const base = { id: 'base', name: 'Base', sellingPrice: 0, notForSale: true, recipe: line };
    const layered = { id: 'layered', name: 'Layered', sellingPrice: 300, recipe: [], parts: [{ itemId: 'base', quantity: 1 }] };
    const { result } = renderHook(() => useMenuActions([base, layered] as any, materials, [], vi.fn(), { today: () => '2026-11-02' }));
    await result.current.applyPriceReview([{ menuItemId: 'layered', newPrice: 400 }]);
    expect(batch.set.mock.calls[0][1].costAtPricing).toBeGreaterThan(0);
  });

  it('reports a failure, so nothing is claimed as saved', async () => {
    batch.commit.mockRejectedValue(new Error('offline'));
    expect(await actions().applyPriceReview([{ menuItemId: 'cake', newPrice: 400 }])).toBe(false);
  });
});
