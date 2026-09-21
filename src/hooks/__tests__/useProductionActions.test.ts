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

describe('logProductionRun — linking a "customer order" run to an Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a linked, pre-fulfilled Order when purpose is customer_order', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await result.current.logProductionRun({
      recipeId: 'cake',
      quantityProduced: 3,
      date: '2026-02-01',
      purpose: 'customer_order',
      costTotal: 15,
    } as any);

    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall).toBeTruthy();
    const [, orderPayload] = orderCall as [any, Order];
    expect(orderPayload.menuItemId).toBe('cake');
    expect(orderPayload.quantity).toBe(3);
    expect(orderPayload.date).toBe('2026-02-01');
    expect(orderPayload.fulfilled).toBe(true);
    expect(orderPayload.productionRunId).toBeTruthy();

    expect(showAlert).toHaveBeenCalledWith('Production Run Logged', expect.stringContaining('Orders tab'));
  });

  it('does NOT create an order for other purposes (e.g. market_stock)', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await result.current.logProductionRun({
      recipeId: 'cake',
      quantityProduced: 3,
      date: '2026-02-01',
      purpose: 'market_stock',
      costTotal: 15,
    } as any);

    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall).toBeFalsy();
  });
});

describe('backfillMissingOrders — catching up runs logged before the linking feature existed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('identifies customer-order runs with no linked order, and only those', () => {
    const linkedRun: ProductionRun = { id: 'run-a', recipeId: 'cake', quantityProduced: 2, date: '2026-01-01', purpose: 'customer_order', costTotal: 10 } as ProductionRun;
    const unlinkedRun: ProductionRun = { id: 'run-b', recipeId: 'cake', quantityProduced: 4, date: '2026-01-02', purpose: 'customer_order', costTotal: 20 } as ProductionRun;
    const marketRun: ProductionRun = { id: 'run-c', recipeId: 'cake', quantityProduced: 1, date: '2026-01-03', purpose: 'market_stock', costTotal: 5 } as ProductionRun;
    const existingOrder: Order = { id: 'order-a', menuItemId: 'cake', quantity: 2, date: '2026-01-01', fulfilled: true, productionRunId: 'run-a' };

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [linkedRun, unlinkedRun, marketRun], [existingOrder], showAlert)
    );

    expect(result.current.runsNeedingOrderBackfill).toHaveLength(1);
    expect(result.current.runsNeedingOrderBackfill[0].id).toBe('run-b');
  });

  it('creates orders for all missing runs in one batch, without touching inventory', async () => {
    const unlinkedRun1: ProductionRun = { id: 'run-x', recipeId: 'cake', quantityProduced: 2, date: '2026-01-01', purpose: 'customer_order', costTotal: 10 } as ProductionRun;
    const unlinkedRun2: ProductionRun = { id: 'run-y', recipeId: 'cake', quantityProduced: 5, date: '2026-01-05', purpose: 'customer_order', costTotal: 25 } as ProductionRun;

    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [unlinkedRun1, unlinkedRun2], [], showAlert)
    );

    await result.current.backfillMissingOrders();

    // Only order writes — no materials/menu writes, since inventory was
    // already correctly adjusted when each run was originally logged.
    expect(batchSet).toHaveBeenCalledTimes(2);
    for (const [, payload] of batchSet.mock.calls) {
      expect(payload.fulfilled).toBe(true);
      expect(['run-x', 'run-y']).toContain(payload.productionRunId);
    }
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Backfill Complete', expect.stringContaining('2'));
  });

  it('does nothing when there is nothing to backfill', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useProductionActions(menu, materials, [], [], showAlert)
    );

    await result.current.backfillMissingOrders();

    expect(batchCommit).not.toHaveBeenCalled();
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
});
