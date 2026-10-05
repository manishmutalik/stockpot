import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setDoc = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.slice(1).join('/') })),
  setDoc: (...args: any[]) => setDoc(...args),
  deleteDoc: vi.fn(),
}));

import { useMenuActions } from '../useMenuActions';

const materials: any[] = [
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 500, category: 'Raw Materials' },
  { id: 'box', name: 'Box', unit: 'pcs', costPerUnit: 10, category: 'Packaging Materials' },
];
const recipe = [{ materialId: 'butter', amount: 200, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }]; // 110
const cake = (over: Record<string, any> = {}): any => ({ id: 'cake', name: 'Cake', sellingPrice: 0, recipe, ...over });
const hook = (menu: any[]) => renderHook(() => useMenuActions(menu, materials, [], vi.fn(), { today: () => '2026-10-05' })).result.current;

describe('the pricing stamp', () => {
  beforeEach(() => setDoc.mockClear());

  it('is written with the price: the day, the unit cost and each material\'s cost per unit', async () => {
    await hook([cake()]).updateMenuItemField('cake', 'sellingPrice', 400);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, opts] = setDoc.mock.calls[0];
    expect(ref.path).toBe('users/user1/menu/cake');
    expect(opts).toEqual({ merge: true });
    expect(data).toMatchObject({
      sellingPrice: 400, pricedAt: '2026-10-05', costAtPricing: 110, pricingIsBaseline: false,
      materialCostsAtPricing: { butter: 500, box: 10 },
    });
  });

  it('is not written for other fields, nor when the price is cleared', async () => {
    const h = hook([cake({ sellingPrice: 400 })]);
    await h.updateMenuItemField('cake', 'shelfLifeDays', 3);
    await h.updateMenuItemField('cake', 'sellingPrice', 0);
    for (const [, data] of setDoc.mock.calls) {
      expect(data).not.toHaveProperty('pricedAt');
      expect(data).not.toHaveProperty('costAtPricing');
    }
  });

  it('a new price replaces an old baseline with a real stamp at today\'s costs', async () => {
    const old = cake({ sellingPrice: 400, pricedAt: '2026-06-01', costAtPricing: 90, materialCostsAtPricing: { butter: 400 }, pricingIsBaseline: true });
    await hook([old]).updateMenuItemField('cake', 'sellingPrice', 450);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ pricedAt: '2026-10-05', costAtPricing: 110, pricingIsBaseline: false, materialCostsAtPricing: { butter: 500, box: 10 } });
  });
});

describe('stampPricingBaselines', () => {
  beforeEach(() => setDoc.mockClear());

  it('stamps priced items that have no stamp, at current costs, marked as a baseline', async () => {
    const n = await hook([cake({ sellingPrice: 400 })]).stampPricingBaselines();
    expect(n).toBe(1);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).toEqual({ pricedAt: '2026-10-05', costAtPricing: 110, materialCostsAtPricing: { butter: 500, box: 10 }, pricingIsBaseline: true });
  });

  it('leaves unpriced items and items already stamped alone, so each is stamped once', async () => {
    const stamped = cake({ id: 'a', sellingPrice: 400, pricedAt: '2026-06-01', costAtPricing: 90, materialCostsAtPricing: {} });
    const n = await hook([cake({ id: 'b', sellingPrice: 0 }), stamped]).stampPricingBaselines();
    expect(n).toBe(0);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
