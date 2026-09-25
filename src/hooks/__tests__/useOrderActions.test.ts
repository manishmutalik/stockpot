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
  setDoc: vi.fn(),
}));

import { useOrderActions } from '../useOrderActions';
import type { MenuItem, Order } from '../../types';

const showConfirm = vi.fn();

describe('addOrderGroup — adding a customer order with one or more items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 10 } as MenuItem,
    { id: 'cookie', name: 'Cookie', sellingPrice: 5, recipe: [], finishedGoodsStock: 10 } as MenuItem,
  ];

  it('a single line item gets no orderGroupId, writes one order document, and claims stock', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
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

    const menuCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuCall[1].finishedGoodsStock).toBe(7); // 10 - 3

    expect(showAlert).toHaveBeenCalledWith('Order Added', expect.stringContaining('Cake'));
  });

  it('multiple line items share one orderGroupId and shared customer/date fields, written atomically', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
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
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
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
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
    );

    await result.current.addOrderGroup({ date: '2026-04-01' }, [{ menuItemId: 'cake', quantity: 1 }]);

    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall[1]).not.toHaveProperty('customerName');
    expect(orderCall[1]).not.toHaveProperty('customerPhone');
  });

  it('rejects an order that needs more than is currently in stock, without writing anything', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
    );

    await expect(
      result.current.addOrderGroup({ date: '2026-04-01' }, [{ menuItemId: 'cake', quantity: 11 }])
    ).rejects.toThrow();

    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.stringContaining('Cake'));
  });

  it('combines quantities when the same item appears in more than one line before checking stock', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [], '2026-04-01', showConfirm, showAlert)
    );

    // Two rows of 6 each — neither exceeds the 10 in stock alone, but together they do.
    await expect(
      result.current.addOrderGroup(
        { date: '2026-04-01' },
        [{ menuItemId: 'cake', quantity: 6 }, { menuItemId: 'cake', quantity: 6 }]
      )
    ).rejects.toThrow();

    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe('fulfillOrder — a plain completion status with no inventory effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 7 } as MenuItem,
  ];
  const order: Order = { id: 'o1', menuItemId: 'cake', quantity: 3, date: '2026-01-01' };

  it('marks the order fulfilled without touching finishedGoodsStock', async () => {
    const setDocMock = (await import('../../firebase')).setDoc as any;
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.fulfillOrder(order);

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = setDocMock.mock.calls[0];
    expect(payload).toEqual({ fulfilled: true });
    // No batch/menu write at all — stock was already claimed at order creation.
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('is a no-op if the order was already fulfilled', async () => {
    const setDocMock = (await import('../../firebase')).setDoc as any;
    const fulfilledOrder: Order = { ...order, fulfilled: true };
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [fulfilledOrder], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.fulfillOrder(fulfilledOrder);

    expect(setDocMock).not.toHaveBeenCalled();
  });
});

describe('updateOrder — item/quantity edits re-balance claimed stock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 4 } as MenuItem,
    { id: 'cookie', name: 'Cookie', sellingPrice: 5, recipe: [], finishedGoodsStock: 2 } as MenuItem,
  ];
  const order: Order = { id: 'o1', menuItemId: 'cake', quantity: 3, date: '2026-01-01' };

  it('raising the quantity claims the difference from the same item', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'quantity', 5); // 4 available + 3 already claimed = 7 max

    const menuCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuCall[1].finishedGoodsStock).toBe(2); // 4 - (5 - 3)
    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall[1]).toMatchObject({ menuItemId: 'cake', quantity: 5 });
  });

  it('lowering the quantity releases the difference back', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'quantity', 1);

    const menuCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuCall[1].finishedGoodsStock).toBe(6); // 4 + (3 - 1)
  });

  it('rejects a quantity increase beyond what is available, leaving the order unchanged', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'quantity', 8); // max is 4 + 3 = 7

    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.stringContaining('Cake'));
  });

  it('switching items releases the old item and claims the new one', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'menuItemId', 'cookie'); // still quantity 3, but only 2 cookies in stock — should be rejected

    expect(batchCommit).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Not Enough Stock', expect.stringContaining('Cookie'));
  });

  it('switching to an item with enough stock releases the old claim and claims the new item', async () => {
    const roomyMenu: MenuItem[] = [
      { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 4 } as MenuItem,
      { id: 'cookie', name: 'Cookie', sellingPrice: 5, recipe: [], finishedGoodsStock: 9 } as MenuItem,
    ];
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(roomyMenu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'menuItemId', 'cookie');

    const menuCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/menu/'));
    const cakeCall = menuCalls.find(([ref]: any[]) => ref.path.includes('/menu/cake'));
    const cookieCall = menuCalls.find(([ref]: any[]) => ref.path.includes('/menu/cookie'));
    expect(cakeCall[1].finishedGoodsStock).toBe(7); // 4 + 3 released
    expect(cookieCall[1].finishedGoodsStock).toBe(6); // 9 - 3 claimed
    const orderCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/orders/'));
    expect(orderCall[1]).toMatchObject({ menuItemId: 'cookie', quantity: 3 });
  });

  it('other fields (e.g. customerName) are a plain write with no stock effect', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.updateOrder('o1', 'customerName', 'Asha');

    expect(batchCommit).not.toHaveBeenCalled(); // plain fields go through setDoc, not a batch
    const setDocMock = (await import('../../firebase')).setDoc as any;
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });
});

describe('deleteOrder — restoring the stock an order had claimed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 4 } as MenuItem,
  ];
  const order: Order = { id: 'o1', menuItemId: 'cake', quantity: 3, date: '2026-01-01' };

  it('deletes the order and restores its claimed quantity in the same batch', async () => {
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, [order], '2026-01-01', showConfirm, showAlert)
    );

    await result.current.deleteOrder('o1');

    expect(batchDelete).toHaveBeenCalledTimes(1);
    const menuCall = batchSet.mock.calls.find(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuCall[1].finishedGoodsStock).toBe(7); // 4 + 3
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });
});

describe('resetOrders — bulk-deleting a date, restoring stock aggregated per item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const menu: MenuItem[] = [
    { id: 'cake', name: 'Cake', sellingPrice: 20, recipe: [], finishedGoodsStock: 2 } as MenuItem,
  ];
  const ordersForDate: Order[] = [
    { id: 'o1', menuItemId: 'cake', quantity: 3, date: '2026-05-01' },
    { id: 'o2', menuItemId: 'cake', quantity: 4, date: '2026-05-01' },
    { id: 'o3', menuItemId: 'cake', quantity: 1, date: '2026-05-02' }, // different date — untouched
  ];

  it('deletes every order for the date and restores their combined stock with one write per item', async () => {
    showConfirm.mockImplementation((_t, _m, onConfirm) => onConfirm());
    const showAlert = vi.fn();
    const { result } = renderHook(() =>
      useOrderActions(menu, ordersForDate, '2026-05-01', showConfirm, showAlert)
    );

    result.current.resetOrders();
    await vi.waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));

    expect(batchDelete).toHaveBeenCalledTimes(2); // o1, o2 — not o3
    const menuCalls = batchSet.mock.calls.filter(([ref]: any[]) => ref.path.includes('/menu/'));
    expect(menuCalls).toHaveLength(1); // aggregated into one write for 'cake'
    expect(menuCalls[0][1].finishedGoodsStock).toBe(9); // 2 + 3 + 4
  });
});
