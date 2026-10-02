import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setDocMock = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  setDoc: (...a: any[]) => setDocMock(...a),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
}));
vi.mock('../../utils/apiClient', () => ({ apiFetch: vi.fn() }));

import { useInventoryActions } from '../useInventoryActions';
import type { RawMaterial } from '../../types';

const restockWith = async (material: Partial<RawMaterial>, qty: string, total: string) => {
  const { result } = renderHook(() => useInventoryActions([material as RawMaterial], ['Raw Materials'], [], vi.fn(), vi.fn()));
  act(() => { result.current.setRestockMaterial(material as RawMaterial); result.current.setRestockQty(qty); result.current.setRestockBaseTotal(total); });
  await act(async () => { await result.current.handleRestock({ preventDefault: () => {} } as any); });
  const call = setDocMock.mock.calls.find(([ref]: any[]) => ref.path.includes('/materials/'))!;
  return call[1] as { initialStock: number; costPerUnit: number };
};

describe('handleRestock — the moving-average cost keeps its precision', () => {
  beforeEach(() => { setDocMock.mockReset(); });

  it('keeps a per-gram cost exactly: 1,000 g bought for 45 costs 0.045 a gram, not 0.04', async () => {
    const saved = await restockWith({ id: 'm', unit: 'g', initialStock: 0, costPerUnit: 0 }, '1000', '45');
    expect(saved.initialStock).toBe(1000);
    expect(saved.costPerUnit).toBe(0.045);
  });

  it('blends the old and new price by quantity without rounding it to cents', async () => {
    // 5,000 g at 0.045 plus 1,000 g bought for 60 -> (225 + 60) / 6000 = 0.0475
    const saved = await restockWith({ id: 'm', unit: 'g', initialStock: 5000, costPerUnit: 0.045 }, '1000', '60');
    expect(saved.costPerUnit).toBe(0.0475);
  });

  it('gives the right blended cost for a per-kilo material too', async () => {
    // 2 kg at 500 plus 2 kg bought for 620 -> (1000 + 620) / 4 = 405
    const saved = await restockWith({ id: 'm', unit: 'kg', initialStock: 2, costPerUnit: 500 }, '2', '620');
    expect(saved.costPerUnit).toBe(405);
  });
});
