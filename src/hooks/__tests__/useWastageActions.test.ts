import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const batchSet = vi.fn();
const batchCommit = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
}));

import { useWastageActions } from '../useWastageActions';
import type { RawMaterial, MenuItem } from '../../types';

const materials: RawMaterial[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', initialStock: 10, costPerUnit: 2, category: 'Raw Materials', threshold: 1, dateAdded: '2026-01-01' },
];
const menu: MenuItem[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 5 } as MenuItem,
];

describe('useWastageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls showAlert (not a phantom toast global) on successful discard', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() => useWastageActions(materials, menu, showAlert));

    act(() => {
      result.current.setDiscardTarget({
        id: 'flour', name: 'Flour', type: 'material', maxQty: 10, unit: 'kg', costPerUnit: 2,
      });
      result.current.setDiscardQty('2');
    });

    await act(async () => {
      await result.current.handleDiscard({ preventDefault: () => {} } as any);
    });

    expect(showAlert).toHaveBeenCalledWith('Success', expect.stringContaining('logged'));
    expect(batchCommit).toHaveBeenCalledTimes(1);
    // One write for the wastage log, one for the updated material stock.
    expect(batchSet).toHaveBeenCalledTimes(2);
  });

  it('does nothing if there is no discard target or quantity', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() => useWastageActions(materials, menu, showAlert));

    await act(async () => {
      await result.current.handleDiscard({ preventDefault: () => {} } as any);
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('seeds the Reason field from presetReason when a target carries one (Market Stock quick actions)', () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() => useWastageActions(materials, menu, showAlert));

    act(() => {
      result.current.setDiscardTarget({
        id: 'cake', name: 'Cake', type: 'recipe', maxQty: 5, unit: 'pcs', costPerUnit: 3, presetReason: 'Personal Use',
      });
    });

    expect(result.current.discardReason).toBe('Personal Use');
  });

  it('clears any leftover reason when a new target has no presetReason', () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() => useWastageActions(materials, menu, showAlert));

    act(() => {
      result.current.setDiscardTarget({
        id: 'cake', name: 'Cake', type: 'recipe', maxQty: 5, unit: 'pcs', costPerUnit: 3, presetReason: 'Sampling',
      });
    });
    expect(result.current.discardReason).toBe('Sampling');

    act(() => {
      result.current.setDiscardTarget({
        id: 'flour', name: 'Flour', type: 'material', maxQty: 10, unit: 'kg', costPerUnit: 2,
      });
    });

    expect(result.current.discardReason).toBe('');
  });

  it('logs the preset reason on the wastage entry when the quick action is confirmed', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() => useWastageActions(materials, menu, showAlert));

    act(() => {
      result.current.setDiscardTarget({
        id: 'cake', name: 'Cake', type: 'recipe', maxQty: 5, unit: 'pcs', costPerUnit: 3, presetReason: 'Sampling',
      });
      result.current.setDiscardQty('2');
    });

    await act(async () => {
      await result.current.handleDiscard({ preventDefault: () => {} } as any);
    });

    const wastageLogCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('wastageLogs'));
    expect(wastageLogCall[1].reason).toBe('Sampling');
  });
});
