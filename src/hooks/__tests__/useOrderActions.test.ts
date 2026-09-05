import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchCommit = vi.fn();

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import { useOrderActions } from '../useOrderActions';
import type { MenuItem, Order, RawMaterial } from '../../types';
import type { ProductionRun } from '../../components/ProductionRunModal';

const materials: RawMaterial[] = [];
const productionRuns: ProductionRun[] = [];
const showConfirm = vi.fn();

const orderNoStock: Order = { id: 'o1', menuItemId: 'cake', quantity: 3, date: '2026-01-01' };

describe('fulfillOrder (now wired to the Fulfill button in OrdersView)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deducts raw materials when there is no finished-goods stock, and marks the order fulfilled', async () => {
    const menu: MenuItem[] = [
      { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 0 } as MenuItem,
    ];
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [orderNoStock], materials, productionRuns, '2026-01-01', showConfirm, showAlert)
    );

    await result.current.fulfillOrder(orderNoStock);

    expect(batchCommit).toHaveBeenCalledTimes(1);
    const fulfilledCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(fulfilledCall[1]).toEqual({ fulfilled: true });
    expect(showAlert).toHaveBeenCalledWith('Order Fulfilled', expect.any(String));
  });

  it('deducts from finished-goods stock (FIFO across production runs) when enough is on hand', async () => {
    const menu: MenuItem[] = [
      { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 10 } as MenuItem,
    ];
    const runs: ProductionRun[] = [
      { id: 'run1', recipeId: 'cake', quantityProduced: 5, remainingQuantity: 5, date: '2026-01-01', purpose: 'customer_order', costTotal: 10 } as ProductionRun,
    ];
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [orderNoStock], materials, runs, '2026-01-01', showConfirm, showAlert)
    );

    await result.current.fulfillOrder(orderNoStock);

    const menuUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuUpdateCall[1].finishedGoodsStock).toBe(7); // 10 - 3
    const runUpdateCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/productionRuns/'));
    expect(runUpdateCall[1].remainingQuantity).toBe(2); // 5 - 3
  });

  it('is a no-op if the order was already fulfilled, preventing double-deduction', async () => {
    const menu: MenuItem[] = [
      { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 0 } as MenuItem,
    ];
    const fulfilledOrder: Order = { ...orderNoStock, fulfilled: true };
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [fulfilledOrder], materials, productionRuns, '2026-01-01', showConfirm, showAlert)
    );

    await result.current.fulfillOrder(fulfilledOrder);

    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });
});
