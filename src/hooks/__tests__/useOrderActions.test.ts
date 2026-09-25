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

describe('addOrderGroup — adding a customer order with one or more items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [] } as MenuItem,
    { id: 'cookie', name: 'Cookie', sellingPrice: 5, recipe: [] } as MenuItem,
  ];

  it('a single line item gets no orderGroupId and writes one order document', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], materials, productionRuns, '2026-04-01', showConfirm, showAlert)
    );

    await result.current.addOrderGroup(
      { date: '2026-04-01' },
      [{ menuItemId: 'cake', quantity: 3 }]
    );

    expect(batchCommit).toHaveBeenCalledTimes(1);
    const orderCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0][1].orderGroupId).toBeUndefined();
    expect(orderCalls[0][1]).toMatchObject({ menuItemId: 'cake', quantity: 3, date: '2026-04-01' });
    expect(showAlert).toHaveBeenCalledWith('Order Added', expect.stringContaining('Cake'));
  });

  it('multiple line items share one orderGroupId and shared customer/date fields, written atomically', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], materials, productionRuns, '2026-04-01', showConfirm, showAlert)
    );

    await result.current.addOrderGroup(
      { date: '2026-04-01', customerName: 'Asha', customerPhone: '555-1234' },
      [{ menuItemId: 'cake', quantity: 2 }, { menuItemId: 'cookie', quantity: 5 }]
    );

    expect(batchCommit).toHaveBeenCalledTimes(1); // one atomic write, not one per row
    const orderCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCalls).toHaveLength(2);

    const groupId = orderCalls[0][1].orderGroupId;
    expect(groupId).toBeTruthy();
    expect(orderCalls[1][1].orderGroupId).toBe(groupId);
    for (const [, payload] of orderCalls) {
      expect(payload.customerName).toBe('Asha');
      expect(payload.customerPhone).toBe('555-1234');
      expect(payload.date).toBe('2026-04-01');
    }
    expect(orderCalls.map(([, p]: any[]) => p.menuItemId).sort()).toEqual(['cake', 'cookie']);
    expect(showAlert).toHaveBeenCalledWith('Order Added', expect.stringContaining('2'));
  });

  it('rejects an unknown menuItemId before writing anything', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], materials, productionRuns, '2026-04-01', showConfirm, showAlert)
    );

    await expect(
      result.current.addOrderGroup(
        { date: '2026-04-01' },
        [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'does-not-exist', quantity: 1 }]
      )
    ).rejects.toThrow();

    expect(batchCommit).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error', expect.stringContaining('could not be found'));
  });

  it('omits customerName/customerPhone entirely when left blank, rather than writing empty strings', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], materials, productionRuns, '2026-04-01', showConfirm, showAlert)
    );

    await result.current.addOrderGroup({ date: '2026-04-01' }, [{ menuItemId: 'cake', quantity: 1 }]);

    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall[1]).not.toHaveProperty('customerName');
    expect(orderCall[1]).not.toHaveProperty('customerPhone');
  });
});

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
