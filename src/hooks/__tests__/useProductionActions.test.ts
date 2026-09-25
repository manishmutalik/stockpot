import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchDelete = vi.fn();
const batchCommit = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, delete: batchDelete, commit: batchCommit })),
}));

import { useProductionActions } from '../useProductionActions';
import type { MenuItem, RawMaterial, Order } from '../../types';
import type { ProductionRun } from '../../components/ProductionRunModal';

const menu: MenuItem[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 5 } as MenuItem,
  { id: 'cookie', name: 'Cookie', sellingPrice: 5, recipe: [], finishedGoodsStock: 10 } as MenuItem,
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

describe('handleDiscardBatch (wired to the expired-batches dropdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the remaining quantity as wastage, zeroes the run, and decrements finished-goods stock', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [expiredBatch], [], showAlert)
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
      useProductionActions(menu, materials, [zeroBatch], [], showAlert)
    );

    await result.current.handleDiscardBatch(zeroBatch);

    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe('logProductionRun — every run adds to stock, no purpose tagging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments finishedGoodsStock without a purpose field at all', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await result.current.logProductionRun({
      recipeId: 'cake',
      quantityProduced: 3,
      date: '2026-02-01',
      costTotal: 15,
    } as any);

    const menuUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuUpdateCall[1].finishedGoodsStock).toBe(8); // 5 (starting) + 3

    const runCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runCall[1].purpose).toBeUndefined();
  });

  it('rejects an unknown recipeId instead of writing a nameless phantom menu item / order', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await expect(
      result.current.logProductionRun({
        recipeId: 'does-not-exist',
        quantityProduced: 3,
        date: '2026-02-01',
        costTotal: 15,
      } as any)
    ).rejects.toThrow();

    expect(batchCommit).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error', expect.stringContaining('could not be found'));
  });

  it('never auto-creates a linked Order (the customer_order auto-link is retired)', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await result.current.logProductionRun({
      recipeId: 'cake',
      quantityProduced: 3,
      date: '2026-02-01',
      costTotal: 15,
    } as any);

    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall).toBeFalsy();
  });
});

describe('logProductionRunSession — logging multiple items from one submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseRow = (recipeId: string) => ({
    recipeId,
    quantityProduced: 2,
    date: '2026-03-01',
    costTotal: 10,
  });

  it('a single row gets no productionSessionId and behaves exactly like logProductionRun alone', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    const outcome = await result.current.logProductionRunSession([baseRow('cake')]);

    expect(outcome).toEqual({ succeededCount: 1, failedIndex: null, sessionId: undefined });
    const runCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runCall[1].productionSessionId).toBeUndefined();
    // Single-row session alert is the normal per-item message, not the consolidated one.
    expect(showAlert).toHaveBeenCalledWith('Production Run Logged', expect.any(String));
    expect(showAlert).not.toHaveBeenCalledWith('Production Runs Logged', expect.any(String));
  });

  it('multiple rows all share one generated productionSessionId and fire one consolidated alert', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    const outcome = await result.current.logProductionRunSession([baseRow('cake'), baseRow('cookie')]);

    expect(outcome.succeededCount).toBe(2);
    expect(outcome.failedIndex).toBeNull();
    expect(outcome.sessionId).toBeTruthy();

    const runCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runCalls).toHaveLength(2);
    expect(runCalls[0][1].productionSessionId).toBe(outcome.sessionId);
    expect(runCalls[1][1].productionSessionId).toBe(outcome.sessionId);

    // One consolidated alert, not two per-item ones.
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Production Runs Logged', expect.stringContaining('2'));
  });

  it('stops at the first failing row, leaving earlier rows saved and reporting how far it got', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    const outcome = await result.current.logProductionRunSession([
      baseRow('cake'),
      baseRow('does-not-exist'), // fails logProductionRun's menu-item lookup
      baseRow('cookie'),
    ]);

    expect(outcome.succeededCount).toBe(1);
    expect(outcome.failedIndex).toBe(1);
    expect(outcome.sessionId).toBeTruthy();

    // Only the first (successful) row was actually written — the loop stops,
    // it doesn't skip the bad row and keep going.
    const runCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0][1].recipeId).toBe('cake');

    // The failure's own error alert still shows even though later rows didn't run.
    expect(showAlert).toHaveBeenCalledWith('Error', expect.stringContaining('could not be found'));
    // No consolidated success alert, since not every row succeeded.
    expect(showAlert).not.toHaveBeenCalledWith('Production Runs Logged', expect.any(String));
  });

  it('a retry with an existingSessionId reuses it instead of starting a new group', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    const first = await result.current.logProductionRunSession([baseRow('cake'), baseRow('does-not-exist')]);
    expect(first.failedIndex).toBe(1);
    const sessionIdFromFirstAttempt = first.sessionId;

    vi.clearAllMocks();

    // Retry just the row that failed, passing the session id back in — even
    // though it's a single row now, it must still carry the same session id
    // as the sibling that already saved.
    const retry = await result.current.logProductionRunSession([baseRow('cookie')], sessionIdFromFirstAttempt);

    expect(retry.sessionId).toBe(sessionIdFromFirstAttempt);
    const runCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('productionRuns'));
    expect(runCall[1].productionSessionId).toBe(sessionIdFromFirstAttempt);
  });
});

describe('deleteProductionRun — cleaning up the linked Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the linked order along with the production run', async () => {
    const run: ProductionRun = {
      id: 'run2',
      recipeId: 'cake',
      quantityProduced: 3,
      quantityYield: 3,
      remainingQuantity: 3,
      date: '2026-02-01',
      purpose: 'customer_order',
      costTotal: 15,
    } as ProductionRun;
    const linkedOrder: Order = {
      id: 'order1',
      menuItemId: 'cake',
      quantity: 3,
      date: '2026-02-01',
      fulfilled: true,
      productionRunId: 'run2',
    };

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [run], [linkedOrder], showAlert)
    );

    await result.current.deleteProductionRun('run2');

    expect(batchDelete).toHaveBeenCalledTimes(2); // production run + linked order
    const deletedPaths = batchDelete.mock.calls.map(([ref]: any[]) => ref.path);
    expect(deletedPaths.some((p: string) => p.includes('productionRuns'))).toBe(true);
    expect(deletedPaths.some((p: string) => p.includes('/orders/order1'))).toBe(true);

    window.confirm = originalConfirm;
  });

  it('only deletes the production run when there is no linked order', async () => {
    const run: ProductionRun = {
      id: 'run3',
      recipeId: 'cake',
      quantityProduced: 3,
      quantityYield: 3,
      remainingQuantity: 3,
      date: '2026-02-01',
      purpose: 'market_stock',
      costTotal: 15,
    } as ProductionRun;

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [run], [], showAlert)
    );

    await result.current.deleteProductionRun('run3');

    expect(batchDelete).toHaveBeenCalledTimes(1); // just the production run

    window.confirm = originalConfirm;
  });

  it('with skipConfirm/silent, deletes without prompting and without its own success alert', async () => {
    const run: ProductionRun = {
      id: 'run4', recipeId: 'cake', quantityProduced: 2, quantityYield: 2, remainingQuantity: 2,
      date: '2026-02-01', purpose: 'market_stock', costTotal: 10,
    } as ProductionRun;

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [run], [], showAlert)
    );

    await result.current.deleteProductionRun('run4', { skipConfirm: true, silent: true });

    expect(window.confirm).not.toHaveBeenCalled();
    expect(batchDelete).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalledWith('Success', expect.any(String));

    window.confirm = originalConfirm;
  });

  it('decrements finishedGoodsStock for a new-style run with no purpose (every run now adds to stock)', async () => {
    const run: ProductionRun = {
      id: 'run5', recipeId: 'cake', quantityProduced: 3, quantityYield: 3, remainingQuantity: 3,
      date: '2026-02-01', costTotal: 15,
    } as ProductionRun;

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [run], [], showAlert)
    );

    await result.current.deleteProductionRun('run5');

    const menuUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuUpdateCall[1].finishedGoodsStock).toBe(2); // 5 (starting) - 3

    window.confirm = originalConfirm;
  });

  it('does NOT decrement finishedGoodsStock for a legacy run whose purpose never added stock (e.g. sampling)', async () => {
    const run: ProductionRun = {
      id: 'run6', recipeId: 'cake', quantityProduced: 3, quantityYield: 3, remainingQuantity: 3,
      date: '2026-02-01', purpose: 'sampling', costTotal: 15,
    } as ProductionRun;

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [run], [], showAlert)
    );

    await result.current.deleteProductionRun('run6');

    const menuUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuUpdateCall).toBeUndefined(); // stock was never touched at creation, so it isn't touched here either

    window.confirm = originalConfirm;
  });
});

describe('deleteProductionRunSession — bulk-deleting a whole session with one confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sessionRuns: ProductionRun[] = [
    { id: 'r1', recipeId: 'cake', quantityProduced: 2, quantityYield: 2, remainingQuantity: 2, date: '2026-03-01', purpose: 'market_stock', costTotal: 10, productionSessionId: 'sess1' } as ProductionRun,
    { id: 'r2', recipeId: 'cookie', quantityProduced: 3, quantityYield: 3, remainingQuantity: 3, date: '2026-03-01', purpose: 'market_stock', costTotal: 5, productionSessionId: 'sess1' } as ProductionRun,
    { id: 'r3', recipeId: 'cake', quantityProduced: 1, date: '2026-03-02', purpose: 'market_stock', costTotal: 4 } as ProductionRun, // unrelated
  ];

  it('asks exactly once, then deletes every run in the session without per-run prompts', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, sessionRuns, [], showAlert)
    );

    await result.current.deleteProductionRunSession('sess1');

    expect(window.confirm).toHaveBeenCalledTimes(1);
    const deletedRunIds = batchDelete.mock.calls
      .map(([ref]: any[]) => ref.path)
      .filter((p: string) => p.includes('productionRuns'))
      .map((p: string) => p.split('/').pop());
    expect(deletedRunIds.sort()).toEqual(['r1', 'r2']); // not r3, which isn't part of the session
    expect(showAlert).toHaveBeenCalledWith('Success', expect.stringContaining('2'));
    // Only the one consolidated alert, not one per run.
    expect(showAlert).toHaveBeenCalledTimes(1);

    window.confirm = originalConfirm;
  });

  it('deletes nothing when the confirmation is declined', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, sessionRuns, [], showAlert)
    );

    await result.current.deleteProductionRunSession('sess1');

    expect(batchDelete).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it('is a no-op for a session id with no matching runs', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, sessionRuns, [], showAlert)
    );

    await result.current.deleteProductionRunSession('no-such-session');

    expect(window.confirm).not.toHaveBeenCalled();
    expect(batchDelete).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });
});
