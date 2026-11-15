import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batches: { sets: [string, Record<string, unknown>, unknown?][]; deletes: string[]; committed: boolean }[] = [];
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  writeBatch: vi.fn(() => {
    const b = { sets: [] as [string, Record<string, unknown>, unknown?][], deletes: [] as string[], committed: false };
    batches.push(b);
    return {
      set: (ref: { path: string }, data: Record<string, unknown>, opts?: unknown) => { b.sets.push([ref.path, data, opts]); },
      delete: (ref: { path: string }) => { b.deletes.push(ref.path); },
      commit: vi.fn(async () => { b.committed = true; }),
    };
  }),
}));
vi.mock('../../utils/firestoreError', () => ({ handleFirestoreError: vi.fn(), OperationType: { WRITE: 'write' } }));

import { useMergeMaterials, MERGE_BATCH_SIZE } from '../useMergeMaterials';
import type { PriceLogEntry, RawMaterial } from '../../types';

const sugar = { id: 'sugar', name: 'Sugar', unit: 'kg', initialStock: 2, costPerUnit: 40, category: 'Raw Materials', dateAdded: '2026-01-01' } as RawMaterial;
const chini = { id: 'chini', name: 'Chini', unit: 'g', initialStock: 500, costPerUnit: 0.05, category: 'Raw Materials', dateAdded: '2026-01-01' } as RawMaterial;
const eggs = { id: 'eggs', name: 'Eggs', unit: 'pcs', initialStock: 30, costPerUnit: 7, category: 'Raw Materials', dateAdded: '2026-01-01' } as RawMaterial;

const setup = (priceLog: PriceLogEntry[] = [], materials = [sugar, chini, eggs]) => {
  const showAlert = vi.fn();
  const { result } = renderHook(() => useMergeMaterials({ materials, menu: [], experiments: [], orders: [], wastageLogs: [], priceLog, showAlert }));
  return { merge: result.current.mergeMaterials, showAlert };
};

describe('useMergeMaterials', () => {
  beforeEach(() => { batches.length = 0; });

  it('moves the records first, then updates the kept item and deletes the other together', async () => {
    const priceLog = Array.from({ length: MERGE_BATCH_SIZE + 5 }, (_, i) => ({ id: `p${i}`, materialId: 'chini' })) as PriceLogEntry[];
    const { merge } = setup(priceLog);
    expect(await merge('sugar', 'chini')).toBe(true);
    expect(batches.map(b => [b.sets.length, b.deletes.length])).toEqual([[MERGE_BATCH_SIZE, 0], [5, 0], [1, 1]]);
    expect(batches.every(b => b.committed)).toBe(true);
    const last = batches[2];
    expect(last.sets[0]).toEqual(['users/user1/materials/sugar', { initialStock: 2.5, costPerUnit: 42 }, { merge: true }]);
    expect(last.deletes).toEqual(['users/user1/materials/chini']);
  });

  it('writes nothing for items counted differently, and says why', async () => {
    const { merge, showAlert } = setup();
    expect(await merge('sugar', 'eggs')).toBe(false);
    expect(batches).toHaveLength(0);
    expect(showAlert).toHaveBeenCalledWith('Cannot merge these', expect.stringMatching(/counted in kg and Eggs in pcs/));
  });

  it('writes nothing when an item has gone', async () => {
    const { merge, showAlert } = setup([], [sugar]);
    expect(await merge('sugar', 'chini')).toBe(false);
    expect(batches).toHaveLength(0);
    expect(showAlert).toHaveBeenCalledWith('Could not merge', expect.any(String));
  });
});
