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
});
