import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchCommit = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
}));

import { useProductionActions } from '../useProductionActions';
import type { MenuItem, RawMaterial } from '../../types';
import type { ProductionRun } from '../../components/ProductionRunModal';

const menu: MenuItem[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 5 } as MenuItem,
];
const materials: RawMaterial[] = [];

const expiredBatch: ProductionRun = {
  id: 'run1',
  recipeId: 'cake',
  quantityProduced: 10,
  quantityYield: 10,
  remainingQuantity: 4,
  date: '2026-01-01',
  purpose: 'customer_order',
  costTotal: 20,
} as ProductionRun;

describe('handleDiscardBatch (now wired to the expired-batches dropdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the remaining quantity as wastage, zeroes the run, and decrements finished-goods stock', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [expiredBatch], showAlert)
    );

    await result.current.handleDiscardBatch(expiredBatch);

    expect(batchCommit).toHaveBeenCalledTimes(1);
    // 3 writes: wastage log, remainingQuantity -> 0, finishedGoodsStock decrement
    expect(batchSet).toHaveBeenCalledTimes(3);

    const wastageLogCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('wastageLogs'));
    expect(wastageLogCall[1].quantity).toBe(4);
    expect(wastageLogCall[1].reason).toBe('Expired');

    const runUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runUpdateCall[1].remainingQuantity).toBe(0);

    const menuUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuUpdateCall[1].finishedGoodsStock).toBe(1); // 5 - 4
  });

  it('does nothing when the batch has no remaining quantity', async () => {
    const showAlert = vi.fn();
    const zeroBatch = { ...expiredBatch, remainingQuantity: 0 };
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [zeroBatch], showAlert)
    );

    await result.current.handleDiscardBatch(zeroBatch);

    expect(batchCommit).not.toHaveBeenCalled();
  });
});
