/**
 * The web hooks and the phone app's server commit the same plans (src/utils/plans). These tests run the real hooks
 * and assert that what they write is exactly what the plan says, so the two paths cannot drift apart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const batchSet = vi.fn();
const batchCommit = vi.fn();
const setDocMock = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.slice(1).join('/') })),
  writeBatch: vi.fn(() => ({ set: batchSet, delete: vi.fn(), commit: batchCommit })),
  setDoc: (...a: any[]) => setDocMock(...a),
}));

import { useOrderActions } from '../useOrderActions';
import { useProductionActions } from '../useProductionActions';
import { planOrderGroup, planHandOver, planMarkPaid, planProductionSession, collapseWrites, type PlannedWrite } from '../../utils/plans';
import type { MenuItem, Order, RawMaterial } from '../../types';

const flour: RawMaterial = { id: 'flour', name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05, category: 'Raw Materials', threshold: 100, dateAdded: '2026-01-01' };
const cake = { id: 'cake', name: 'Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [{ materialId: 'flour', amount: 400, unit: 'g' }] } as MenuItem;
const bread = { id: 'bread', name: 'Bread', sellingPrice: 120, finishedGoodsStock: 1, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] } as MenuItem;
const menu = [cake, bread];
const materials = [flour];

/** Math.random and Date.now made repeatable, so a hook and a plan draw the same ids and times. */
let seq = 0;
const resetSeq = () => { seq = 0; };
beforeEach(() => {
  vi.clearAllMocks();
  resetSeq();
  vi.spyOn(Math, 'random').mockImplementation(() => 0.1 + (++seq) / 1000);
  vi.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
});
afterEach(() => vi.restoreAllMocks());

const randomId = () => Math.random().toString(36).substr(2, 9);
/** What the hook handed to the Firestore batch, in the plan's shape. */
const committed = (): PlannedWrite[] => batchSet.mock.calls.map(([ref, data, opts]: any[]) => {
  const [, , collection, id] = ref.path.split('/') as [string, string, PlannedWrite['collection'], string];
  return { collection, id, data, merge: !!opts?.merge };
});
/** The final state of every document the writes touch, in order. */
const finalState = (writes: PlannedWrite[]) => {
  const docs = new Map<string, Record<string, unknown>>();
  for (const w of writes) {
    const key = `${w.collection}/${w.id}`;
    docs.set(key, w.merge ? { ...(docs.get(key) ?? {}), ...w.data } : { ...w.data });
  }
  return Object.fromEntries(docs);
};

describe('hook and plan write the same documents', () => {
  const hook = (orders: Order[] = [], over: object = {}) => renderHook(() =>
    useOrderActions(menu, orders, '2026-10-06', vi.fn(), vi.fn(), materials, { upi: 0.5 }, { today: () => '2026-10-06', ...over })).result.current;

  it('adding a pre-order with an advance', async () => {
    const common = { date: '2026-10-10', preorder: true, dueSlot: 'evening', notes: 'Eggless', customerName: 'Priya', advance: { amount: 500, method: 'upi' as const } };
    const lines = [{ menuItemId: 'cake', quantity: 2 }, { menuItemId: 'bread', quantity: 1 }];

    await hook().addOrderGroup(common, lines);
    const fromHook = committed();

    resetSeq();
    const plan = planOrderGroup({ common, lineItems: lines, menu, materials, feeRates: { upi: 0.5 }, today: '2026-10-06', ctx: { newId: randomId } });
    if (plan.ok === false) throw new Error('expected ok');
    expect(fromHook).toEqual(plan.writes);
  });

  it('adding an order from stock (the stock is claimed in the same write)', async () => {
    const common = { date: '2026-10-06', paymentMethod: 'upi' as const };
    const lines = [{ menuItemId: 'cake', quantity: 3 }];
    await hook().addOrderGroup(common, lines);
    const fromHook = committed();

    resetSeq();
    const plan = planOrderGroup({ common, lineItems: lines, menu, materials, feeRates: { upi: 0.5 }, today: '2026-10-06', ctx: { newId: randomId } });
    if (plan.ok === false) throw new Error('expected ok');
    expect(fromHook).toEqual(plan.writes);
    expect(fromHook.find(w => w.collection === 'menu')!.data).toEqual({ finishedGoodsStock: 2 });
  });

  it('handing over a pre-order', async () => {
    const pre = { id: 'p1', menuItemId: 'cake', quantity: 2, date: '2026-10-10', preorder: true, stockClaimed: false, unitPriceAtSale: 850 } as Order;
    await hook([pre]).fulfillOrder(pre);
    const plan = planHandOver({ order: pre, orders: [pre], menu, materials });
    if (plan.kind !== 'ok') throw new Error('expected ok');
    expect(committed()).toEqual(plan.writes);
  });

  it('handing over an ordinary order is one plain field write', async () => {
    const order = { id: 'o1', menuItemId: 'cake', quantity: 1, date: '2026-10-06' } as Order;
    await hook([order]).fulfillOrder(order);
    const plan = planHandOver({ order, orders: [order], menu, materials });
    if (plan.kind !== 'ok') throw new Error('expected ok');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][1]).toEqual(plan.writes[0].data);
    expect(batchSet).not.toHaveBeenCalled();
  });

  it('marking orders paid', async () => {
    await hook().markOrdersPaid(['a', 'b'], true, 'upi');
    expect(committed()).toEqual(planMarkPaid({ ids: ['a', 'b'], paid: true, method: 'upi', feeRates: { upi: 0.5 } }));
  });

  it('logging a production session: the hook saves row by row, the plan in one go, and the documents end up identical', async () => {
    const rows = [
      { recipeId: 'cake', quantityProduced: 2, date: '2026-10-06', costTotal: 0 },
      { recipeId: 'bread', quantityProduced: 4, date: '2026-10-06', costTotal: 0 },
    ];
    const actions = renderHook(() => useProductionActions(menu, materials, [], [], vi.fn())).result.current;
    await actions.logProductionRunSession(rows as any);
    const fromHook = finalState(committed());

    resetSeq();
    const plan = planProductionSession(rows as any, { materials, menu }, { newId: randomId, now: () => Date.now() });
    if (plan.ok === false) throw new Error('expected ok');
    expect(fromHook).toEqual(finalState(plan.writes));
    expect(fromHook['materials/flour']).toEqual({ initialStock: 5000 - 800 - 2000 }); // both items' flour, once
    expect(collapseWrites(plan.writes)).toHaveLength(plan.writes.length); // already one write per document
  });
});
