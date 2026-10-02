import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setDocMock = vi.fn();
const batchSet = vi.fn();
const batchCommit = vi.fn();
let csvRows: any[] = [];
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  setDoc: (...a: any[]) => setDocMock(...a),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ set: batchSet, delete: vi.fn(), commit: batchCommit })),
}));
vi.mock('../../utils/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('papaparse', () => ({ default: { parse: (_f: any, opts: any) => opts.complete({ data: csvRows }) } }));

import { useInventoryActions, COST_EDIT_LOG_DELAY_MS } from '../useInventoryActions';
import type { RawMaterial } from '../../types';

const materialWrite = () => batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/materials/'))!;
const logWrites = () => batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/priceLog/'));

const restockWith = async (material: Partial<RawMaterial>, qty: string, total: string) => {
  const { result } = renderHook(() => useInventoryActions([material as RawMaterial], ['Raw Materials'], [], vi.fn(), vi.fn()));
  act(() => { result.current.setRestockMaterial(material as RawMaterial); result.current.setRestockQty(qty); result.current.setRestockBaseTotal(total); });
  await act(async () => { await result.current.handleRestock({ preventDefault: () => {} } as any); });
  return materialWrite()[1] as { initialStock: number; costPerUnit: number };
};

describe('handleRestock — the moving-average cost keeps its precision', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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

describe('handleRestock — the price log', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('writes exactly one entry with the price paid and the new average, together with the material in one batch', async () => {
    await restockWith({ id: 'm', unit: 'kg', initialStock: 2, costPerUnit: 500 }, '2', '620');
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(setDocMock).not.toHaveBeenCalled();
    const logs = logWrites();
    expect(logs).toHaveLength(1);
    const [ref, entry] = logs[0];
    expect(ref.path.endsWith(`users/user1/priceLog/${entry.id}`)).toBe(true);
    // 2 kg bought for 620 is 310 a kg; the average of that and the old 500 is 405
    expect(entry).toMatchObject({ materialId: 'm', unit: 'kg', unitCost: 310, quantity: 2, macAfter: 405, source: 'restock' });
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('records the price per unit paid this time, not the blended average', async () => {
    await restockWith({ id: 'm', unit: 'g', initialStock: 5000, costPerUnit: 0.045 }, '1000', '60');
    expect(logWrites()[0][1]).toMatchObject({ unitCost: 0.06, macAfter: 0.0475, quantity: 1000 });
  });

  it('keeps six decimals of a per-gram price', async () => {
    await restockWith({ id: 'm', unit: 'g', initialStock: 0, costPerUnit: 0 }, '3000', '135.7');
    expect(logWrites()[0][1].unitCost).toBe(0.045233);
  });

  it('writes nothing when the quantity is not positive', async () => {
    await restockWith({ id: 'm', unit: 'g', initialStock: 0, costPerUnit: 0 }, '0', '10').catch(() => {});
    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe('importing materials from CSV — the price log', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const importRows = async (rows: any[]) => {
    csvRows = rows;
    const { result } = renderHook(() => useInventoryActions([], ['Raw Materials'], [], vi.fn(), vi.fn()));
    await act(async () => { result.current.handleImportCSV({ target: { files: [new File([''], 'm.csv')], value: '' } } as any, 'Raw Materials'); });
    await vi.waitFor(() => expect(batchCommit).toHaveBeenCalled());
  };

  it('starts the history of each imported material that has a cost', async () => {
    await importRows([
      { Name: 'Flour', Unit: 'kg', 'Initial Stock': '100', Cost: '45', Threshold: '20' },
      { Name: 'Water', Unit: 'l', 'Initial Stock': '10', Cost: '0', Threshold: '0' },
      { Name: 'Salt', Unit: 'kg', 'Initial Stock': '0', Cost: '20', Threshold: '1' },
    ]);
    const mats = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/materials/'));
    expect(mats).toHaveLength(3);
    const logs = logWrites().map(c => c[1]);
    expect(logs).toHaveLength(2); // the free item has no price to record
    const flourId = mats.find(([, m]: any[]) => m.name === 'Flour')![1].id;
    expect(logs.find(l => l.materialId === flourId)).toMatchObject({ unit: 'kg', unitCost: 45, quantity: 100, macAfter: 45, source: 'initial' });
    const saltId = mats.find(([, m]: any[]) => m.name === 'Salt')![1].id;
    expect('quantity' in logs.find(l => l.materialId === saltId)!).toBe(false); // none in stock, so no quantity
  });
});

describe('editing a cost by hand — the price log', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); setDocMock.mockResolvedValue(undefined); });
  afterEach(() => { vi.useRealTimers(); });

  const flour = { id: 'flour', name: 'Flour', unit: 'kg', initialStock: 5, costPerUnit: 45 } as RawMaterial;
  const setup = (mats: RawMaterial[] = [flour]) => renderHook(({ m }) => useInventoryActions(m, ['Raw Materials'], [], vi.fn(), vi.fn()), { initialProps: { m: mats } });
  const logCalls = () => setDocMock.mock.calls.filter(([ref]: any[]) => ref.path.includes('/priceLog/'));

  it('writes one entry for where a run of keystrokes ended, not one per keystroke', async () => {
    const { result } = setup();
    for (const v of ['5', '50', '50.5']) await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', parseFloat(v)); });
    expect(logCalls()).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS + 10); });
    expect(logCalls()).toHaveLength(1);
    expect(logCalls()[0][1]).toMatchObject({ materialId: 'flour', unit: 'kg', unitCost: 50.5, macAfter: 50.5, source: 'manual_edit' });
  });

  it('restarts the wait with every keystroke', async () => {
    const { result } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 50); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS - 100); });
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 51); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS - 100); });
    expect(logCalls()).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(logCalls()).toHaveLength(1);
    expect(logCalls()[0][1].unitCost).toBe(51);
  });

  it('writes nothing when the cost ends where it started', async () => {
    const { result } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 4); });
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 45); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS + 10); });
    expect(logCalls()).toHaveLength(0);
  });

  it('writes nothing when the cost is cleared', async () => {
    const { result } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 0); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS + 10); });
    expect(logCalls()).toHaveLength(0);
  });

  it('still saves the material right away, whatever happens to the log', async () => {
    const { result } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 50); });
    const saved = setDocMock.mock.calls.find(([ref]: any[]) => ref.path.includes('/materials/'))!;
    expect(saved[1]).toMatchObject({ costPerUnit: 50 });
  });

  it('keeps a separate wait for each material', async () => {
    const sugar = { id: 'sugar', name: 'Sugar', unit: 'kg', initialStock: 5, costPerUnit: 40 } as RawMaterial;
    const { result } = setup([flour, sugar]);
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 50); });
    await act(async () => { await result.current.updateMaterial('sugar', 'costPerUnit', 42); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS + 10); });
    expect(logCalls().map(c => c[1].materialId).sort()).toEqual(['flour', 'sugar']);
  });

  it('does not log other fields, or a unit change that rescales the cost', async () => {
    const { result } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'threshold', 9); });
    await act(async () => { await result.current.patchMaterial('flour', { unit: 'g', costPerUnit: 0.045 }); });
    await act(async () => { vi.advanceTimersByTime(COST_EDIT_LOG_DELAY_MS + 10); });
    expect(logCalls()).toHaveLength(0);
  });

  it('records a pending edit if the screen goes away before the wait is over', async () => {
    const { result, unmount } = setup();
    await act(async () => { await result.current.updateMaterial('flour', 'costPerUnit', 52); });
    unmount();
    expect(logCalls()).toHaveLength(1);
    expect(logCalls()[0][1].unitCost).toBe(52);
  });
});
