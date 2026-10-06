import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the firebase module before importing anything that depends on it, so
// no real Firebase app/network calls happen during the test.
vi.mock('../../firebase', () => ({
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import { setDoc } from '../../firebase';
import { deductIngredients } from '../inventoryDeduction';
import type { RawMaterial } from '../../types';

const materials: RawMaterial[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', initialStock: 10, costPerUnit: 2, category: 'Raw Materials', threshold: 1, dateAdded: '2026-01-01' },
  { id: 'sugar', name: 'Sugar', unit: 'g', initialStock: 500, costPerUnit: 0.01, category: 'Raw Materials', threshold: 50, dateAdded: '2026-01-01' },
];

describe('deductIngredients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deducts a recipe requirement from matching material stock, converting units', async () => {
    // Recipe calls for 200g of flour; flour is stocked in kg, so this should
    // convert to 0.2kg deducted from the 10kg on hand.
    const recipe = [{ materialId: 'flour', amount: 200, unit: 'g' }];

    await deductIngredients('user1', materials, recipe, 1);

    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, payload] = (setDoc as any).mock.calls[0];
    expect(payload.initialStock).toBeCloseTo(9.8);
  });

  it('scales the deduction by the multiplier (e.g. quantity produced)', async () => {
    const recipe = [{ materialId: 'sugar', amount: 50, unit: 'g' }];

    await deductIngredients('user1', materials, recipe, 3);

    const [, payload] = (setDoc as any).mock.calls[0];
    // 50g * 3 batches = 150g deducted from 500g on hand
    expect(payload.initialStock).toBeCloseTo(350);
  });

  it('restores stock when given a negative multiplier (e.g. reversing a production run)', async () => {
    const recipe = [{ materialId: 'sugar', amount: 50, unit: 'g' }];

    await deductIngredients('user1', materials, recipe, -1);

    const [, payload] = (setDoc as any).mock.calls[0];
    expect(payload.initialStock).toBeCloseTo(550);
  });

  it('skips ingredients that have no matching material', async () => {
    const recipe = [{ materialId: 'does-not-exist', amount: 10, unit: 'g' }];

    await deductIngredients('user1', materials, recipe, 1);

    expect(setDoc).not.toHaveBeenCalled();
  });

  it('adds to a batch instead of writing immediately when a batch is provided', async () => {
    const batchSet = vi.fn();
    const recipe = [{ materialId: 'flour', amount: 100, unit: 'g' }];

    await deductIngredients('user1', materials, recipe, 1, { set: batchSet } as any);

    expect(setDoc).not.toHaveBeenCalled();
    expect(batchSet).toHaveBeenCalledTimes(1);
  });

  describe('when the same material is used more than once', () => {
    it('deducts a material listed on two lines of one recipe by the total, written once', async () => {
      const batchSet = vi.fn();
      const recipe = [
        { materialId: 'sugar', amount: 50, unit: 'g' },
        { materialId: 'sugar', amount: 20, unit: 'g' },
      ];

      await deductIngredients('user1', materials, recipe, 2, { set: batchSet } as any);

      expect(batchSet).toHaveBeenCalledTimes(1);
      expect(batchSet.mock.calls[0][1].initialStock).toBeCloseTo(360); // 500 - (50 + 20) * 2
    });

    it('returns the materials as they stand afterwards, so the next recipe starts from there', async () => {
      const batchSet = vi.fn();
      const first = await deductIngredients('user1', materials, [{ materialId: 'sugar', amount: 100, unit: 'g' }], 2, { set: batchSet } as any);
      expect(first.find(m => m.id === 'sugar')!.initialStock).toBeCloseTo(300);
      expect(first.find(m => m.id === 'flour')!.initialStock).toBe(10); // untouched
      expect(materials.find(m => m.id === 'sugar')!.initialStock).toBe(500); // the input is not changed

      await deductIngredients('user1', first, [{ materialId: 'sugar', amount: 50, unit: 'g' }], 2, { set: batchSet } as any);
      expect(batchSet.mock.calls[1][1].initialStock).toBeCloseTo(200); // 500 - 200 - 100, not 500 - 100
    });

    it('returns the materials unchanged when nothing matched', async () => {
      const out = await deductIngredients('user1', materials, [{ materialId: 'nope', amount: 1, unit: 'g' }], 1);
      expect(out).toEqual(materials);
    });
  });

  it('writes only the stock, never a copy of the rest of the material', async () => {
    const batchSet = vi.fn();
    await deductIngredients('user1', materials, [{ materialId: 'sugar', amount: 50, unit: 'g' }], 1, { set: batchSet } as any);
    expect(batchSet.mock.calls[0][1]).toEqual({ initialStock: 450 });
    expect(batchSet.mock.calls[0][2]).toEqual({ merge: true });
  });
});
