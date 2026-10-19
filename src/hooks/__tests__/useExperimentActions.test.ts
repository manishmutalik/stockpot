import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchDelete = vi.fn();
const batchCommit = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ set: batchSet, delete: batchDelete, commit: batchCommit })),
}));

import { useExperimentActions } from '../useExperimentActions';
import { deleteDoc } from '../../firebase';
import type { MenuItem, RecipeExperiment } from '../../types';

const menu = [
  { id: 'base', name: 'Sponge Base', sellingPrice: 0, recipe: [], notForSale: true, finishedGoodsStock: 6 },
  { id: 'ganache', name: 'Ganache', sellingPrice: 0, recipe: [], notForSale: true, countedIn: 'kg', finishedGoodsStock: 1.5 },
] as MenuItem[];
const exp = (parts?: RecipeExperiment['parts']): RecipeExperiment => ({ id: 'e1', name: 'Trial', date: '2026-10-19', materials: [], ...(parts && { parts }) });
const stockWrite = (id: string) => batchSet.mock.calls.find(([ref]) => ref.path === `users/user1/menu/${id}`)?.[1];
const expWrite = () => batchSet.mock.calls.find(([ref]) => ref.path === 'users/user1/experiments/e1')?.[1];

describe('useExperimentActions: bases and fillings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds one with nothing used, and leaves stock alone', async () => {
    const { result } = renderHook(() => useExperimentActions([exp()], [], menu));
    await result.current.addPartToExperiment('e1', 'base');
    expect(expWrite().parts).toEqual([{ itemId: 'base', quantity: 0 }]);
    expect(stockWrite('base')).toBeUndefined();
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('takes what more is used from stock, in the same write', async () => {
    const { result } = renderHook(() => useExperimentActions([exp([{ itemId: 'base', quantity: 1 }, { itemId: 'ganache', quantity: 0.2 }])], [], menu));
    await result.current.updateExperimentPart('e1', 'base', 3);
    expect(expWrite().parts[0]).toEqual({ itemId: 'base', quantity: 3 });
    expect(stockWrite('base')).toEqual({ finishedGoodsStock: 4 }); // 6 less the 2 more used
    batchSet.mockClear();
    await result.current.updateExperimentPart('e1', 'ganache', 0.05);
    expect(stockWrite('ganache')).toEqual({ finishedGoodsStock: 1.65 }); // 150 g given back
  });

  it('gives it back when the line or the session is removed', async () => {
    const used = [exp([{ itemId: 'base', quantity: 2 }])];
    const { result } = renderHook(() => useExperimentActions(used, [], menu));
    await result.current.removePartFromExperiment('e1', 'base');
    expect(expWrite().parts).toEqual([]);
    expect(stockWrite('base')).toEqual({ finishedGoodsStock: 8 });
    batchSet.mockClear();
    await result.current.deleteExperiment('e1');
    expect(batchDelete).toHaveBeenCalledWith({ path: 'users/user1/experiments/e1' });
    expect(stockWrite('base')).toEqual({ finishedGoodsStock: 8 });
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('deletes a session with no bases as before', async () => {
    const { result } = renderHook(() => useExperimentActions([exp()], [], menu));
    await result.current.deleteExperiment('e1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('after a unit change, sets the amount in the new unit and takes it from the cleared stock', async () => {
    const { result } = renderHook(() => useExperimentActions([exp([{ itemId: 'base', quantity: 300 }])], [], menu));
    await result.current.restartExperimentPart('e1', 'base', 0.3);
    expect(expWrite().parts).toEqual([{ itemId: 'base', quantity: 0.3 }]);
    expect(stockWrite('base')).toEqual({ finishedGoodsStock: -0.3 });
  });
});
